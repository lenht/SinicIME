// imedata.js — in-memory replacement for the sql.js/imenom.jpg data layer.
//
// Loads imenom.json (flat arrays exported by export_imenom_json.py) and
// builds:
//   - rubyToWordLevel : Map<raw ruby string, [[word, level], ...]>
//       (rubynom grouped by exact ruby value, insertion order; consumers
//       sort/filter as needed — addSelRuby and selChar's dict lookup share
//       this but apply different filters, see notes below)
//   - cwordExact/cwordPrefix   : cword direction (Sino/Nom -> ruby)
//   - crubyExact/crubyPrefix   : crubynom direction (ruby -> Sino/Nom)
//       Each direction is a case-sensitive exact-match Map (mirrors SQL
//       "=") plus a trie navigated via ASCII-folded tokens for prefix
//       collection (mirrors SQL "LIKE key<delim>%", which SQLite
//       case-folds for ASCII only by default — see asciiFold below).
//   - cmpRaw / cmpRawFoldedCruby : raw + pre-folded cmpnom rows (rowid
//       order) for selExample's scan
//
// Each exported *JS function mirrors the exact signature and return shape
// of the SQL-backed function it replaces, so call sites in ime.js need
// only swap the function body / call target — the surrounding control
// flow (advanceCompoundWindow, resolveUnit's splice logic, addSelCompound's
// state dispatch, etc.) is untouched.
//
// No sqlEscape() equivalent is needed anywhere here: Map.get() and trie
// traversal compare strings directly, there's no query string being built,
// so apostrophes/quotes in ruby values (e.g. "Tr' Hy", "Ch'om") can't cause
// the injection/crash risk sqlEscape() existed to prevent.

(function (root) {

    // SQLite's default LIKE case-folds only ASCII A-Z/a-z (no ICU
    // extension loaded here) — non-ASCII text (Vietnamese diacritics,
    // Han characters, full-width forms) is compared byte-for-byte, so
    // e.g. "bá" and "BÁ" fold together (the ASCII 'B') but "á"/"Á" do
    // not (they're distinct codepoints, not ASCII case variants). '='
    // has no such folding (no COLLATE NOCASE on these columns) — it's
    // fully case-sensitive. compoundLookup's exact query uses '=', its
    // prefix query uses LIKE, so the two need different case handling.
    // sql.js decodes SQLite TEXT results via a UTF-8 TextDecoder with
    // default settings, which silently drops a single leading U+FEFF
    // (BOM). One row (cmpnom.crubynom for "嫗:姬") has a stray embedded
    // BOM in the source data; SQLite's own matching sees the raw bytes
    // (BOM included, breaking prefix/exact matches on it — verified
    // directly against imenom.db), but any *returned* value has it
    // stripped by the JS-side decoder. So: strip on the way out (select
    // column), never on the way in (match column) — see
    // export_imenom_json.py for the full note.
    function stripBom(s) {
        return (s.length && s.charCodeAt(0) === 0xFEFF) ? s.slice(1) : s;
    }

    function asciiFold(s) {
        var out = '';
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            out += (c >= 65 && c <= 90) ? String.fromCharCode(c + 32) : s[i];
        }
        return out;
    }

    // exactIndex: Map<raw matchVal (case-sensitive, delim-joined), [selectVal, ...]>
    // — mirrors "WHERE matchCol = key" directly, no tokenizing needed.
    //
    // prefixTrie: trie navigated via ASCII-folded tokens; each node's
    // `desc` list collects selectVal (raw, unfolded) for every row whose
    // matchVal continues past this node — mirrors
    // "WHERE matchCol LIKE 'key<delim>%' ORDER BY rowid".
    function buildIndexPair(rows, delim, guardFn) {
        // rows: array of [matchVal, selectVal]
        // guardFn(selectVal): mirrors compoundLookup's extraGuard, which in
        // practice only ever filters on the SELECT column's own
        // nullness/emptiness (selPhone's guard on crubynom).
        var exactIndex = new Map();
        var prefixRoot = { desc: [], children: Object.create(null) };
        for (var i = 0; i < rows.length; i++) {
            var matchVal = rows[i][0], selectVal = stripBom(rows[i][1]);
            if (guardFn && !guardFn(selectVal)) continue;

            var arr = exactIndex.get(matchVal);
            if (!arr) { arr = []; exactIndex.set(matchVal, arr); }
            arr.push(selectVal);

            var tokens = asciiFold(matchVal).split(delim);
            var node = prefixRoot;
            for (var j = 0; j < tokens.length; j++) {
                var t = tokens[j];
                var child = node.children[t];
                if (!child) {
                    child = { desc: [], children: Object.create(null) };
                    node.children[t] = child;
                }
                node.desc.push(selectVal);
                node = child;
            }
        }
        return { exactIndex: exactIndex, prefixRoot: prefixRoot };
    }

    function prefixTrieGet(trieRoot, key, delim) {
        var tokens = asciiFold(key).split(delim);
        var node = trieRoot;
        for (var i = 0; i < tokens.length; i++) {
            node = node.children[tokens[i]];
            if (!node) return null;
        }
        return node;
    }

    function buildIndex(data) {
        var rubynom = data.rubynom; // [word, ruby, level][]
        var cmpnom = data.cmpnom;   // [cword, crubynom][]

        var rubyToWordLevel = new Map();
        for (var i = 0; i < rubynom.length; i++) {
            var word = rubynom[i][0], ruby = rubynom[i][1], level = rubynom[i][2];
            var arr = rubyToWordLevel.get(ruby);
            if (!arr) { arr = []; rubyToWordLevel.set(ruby, arr); }
            arr.push([word, level]);
        }

        var wordToRubyLevel = new Map();
        for (var i = 0; i < rubynom.length; i++) {
            var word = rubynom[i][0], ruby = rubynom[i][1], level = rubynom[i][2];
            var arr = wordToRubyLevel.get(word);
            if (!arr) { arr = []; wordToRubyLevel.set(word, arr); }
            arr.push([ruby, level]);
        }

        // cword direction: matchCol="cword" -> only ever queried by
        // selPhone with guard " AND crubynom <> '' AND crubynom IS NOT
        // NULL" (the guard filters on the SELECT column, crubynom, not
        // on cword itself). Baking the guard into the index build is
        // equivalent because this is the only caller of this direction.
        var cwordIdx = buildIndexPair(cmpnom, ':', function (crubynomVal) {
            return crubynomVal !== null && crubynomVal !== '';
        });

        // crubynom direction: matchCol="crubynom" -> only ever queried by
        // addSelCompound with guard="" (no filter).
        var crubyRows = new Array(cmpnom.length);
        for (var i = 0; i < cmpnom.length; i++) {
            crubyRows[i] = [cmpnom[i][1], cmpnom[i][0]];
        }
        var crubyIdx = buildIndexPair(crubyRows, ' ', null);

        var cmpRawFoldedCruby = new Array(cmpnom.length);
        for (var i = 0; i < cmpnom.length; i++) {
            cmpRawFoldedCruby[i] = asciiFold(cmpnom[i][1]);
        }

        return {
            rubynomRaw: rubynom,
            rubyToWordLevel: rubyToWordLevel,
            wordToRubyLevel: wordToRubyLevel,
            cwordExact: cwordIdx.exactIndex,
            cwordPrefix: cwordIdx.prefixRoot,
            crubyExact: crubyIdx.exactIndex,
            crubyPrefix: crubyIdx.prefixRoot,
            cmpRaw: cmpnom,
            cmpRawFoldedCruby: cmpRawFoldedCruby
        };
    }

    // ---- Drop-in replacement for compoundLookup() ----
    // Original: two SQL queries (exact "=" and prefix "LIKE key<delim>%")
    // against cmpnom. Replicates the original's exact quirk where the
    // LAST prefix-matched row (in rowid order) is pushed twice — once
    // truncated to `size` (this is what conState.lenTail reads), once in
    // full as part of the complete prefix list — since callers depend on
    // that shape.
    function makeCompoundLookupJS(index) {
        return function compoundLookupJS(matchCol, selectCol, key, size, matchDelim, splitDelim, extraGuard, pcubo) {
            var isCword = (matchCol === 'cword');
            var exactMap = isCword ? index.cwordExact : index.crubyExact;
            var prefixRoot = isCword ? index.cwordPrefix : index.crubyPrefix;

            var exactVals = exactMap.get(key) || [];
            var node = prefixTrieGet(prefixRoot, key, matchDelim);
            var descVals = node ? node.desc : [];

            var i, j, split = null;
            for (i = 0; i < exactVals.length; i++) {
                split = exactVals[i].split(splitDelim);
                var xstr = [];
                for (j = 0; j != size; j++) xstr.push(split[j]);
                pcubo.push(xstr);
            }
            var excSz = pcubo.length;

            split = null;
            var rubo = [];
            for (i = 0; i < descVals.length; i++) {
                split = descVals[i].split(splitDelim);
                var xstr2 = [];
                for (j = 0; j != split.length; j++) xstr2.push(split[j]);
                rubo.push(xstr2);
            }
            var prefixFound = (split != null);
            var finalSz = excSz;
            if (prefixFound) {
                var xstr3 = [];
                for (i = 0; i != size; i++) xstr3.push(split[i]);
                pcubo.push(xstr3);
                pcubo = pcubo.concat(rubo);
                finalSz = pcubo.length;
            }
            return { pcubo: pcubo, excSz: excSz, prefixFound: prefixFound, finalSz: finalSz };
        };
    }

    // ---- Drop-in replacements for the two dictSql SELECTs ----
    // Both return a values-array shaped like SQL's contents[0].values:
    // [[otherCol, levelMod], ...] sorted by levelMod desc, matching
    // "order by (level % maxlevel) desc".
    function sortByLevelMod(pairs, maxlevel) {
        var out = pairs.map(function (p) { return [p[0], p[1] % maxlevel]; });
        out.sort(function (a, b) { return b[1] - a[1]; });
        return out;
    }

    function makeDictLookupWordJS(index) {
        // Replaces selPhone's dictSql: select ruby,(level%maxlevel) from
        // rubynom where word=fullchar order by (level%maxlevel) desc
        return function dictLookupWordJS(word, maxlevel) {
            var pairs = index.wordToRubyLevel.get(word);
            if (!pairs) return [];
            return sortByLevelMod(pairs, maxlevel);
        };
    }

    function makeDictLookupRubyJS(index) {
        // Replaces selChar's dictSql: select word,(level%maxlevel) from
        // rubynom where ruby=fullchar order by (level%maxlevel) desc
        // NOTE: no level>1 filter here — matches the original, which is
        // deliberately more permissive than addSelRuby's candidate list.
        return function dictLookupRubyJS(ruby, maxlevel) {
            var pairs = index.rubyToWordLevel.get(ruby);
            if (!pairs) return [];
            return sortByLevelMod(pairs, maxlevel);
        };
    }

    // ---- Drop-in replacements for addSelRuby's two queries ----
    function makeRubyExactLookupJS(index) {
        // Replaces: SELECT word FROM rubynom WHERE ruby=x AND level>1
        //           ORDER BY level DESC
        return function rubyExactLookupJS(ruby) {
            var pairs = index.rubyToWordLevel.get(ruby);
            if (!pairs) return [];
            var filtered = pairs.filter(function (p) { return p[1] > 1; });
            filtered.sort(function (a, b) { return b[1] - a[1]; });
            return filtered.map(function (p) { return p[0]; }); // just the word, matching contents[0].values[i]
        };
    }

    function makeRubyPrefixLookupJS(index) {
        // Replaces addSelRuby's sugCB branch: SELECT word,ruby FROM rubynom
        // WHERE ruby LIKE x% AND ruby != ruby AND level>1 ORDER BY rowid
        // (sugCB is always false in the current code, so this path is
        // presently unreachable — kept for behavioral parity in case
        // that changes.)
        return function rubyPrefixLookupJS(prefixLower, excludeRuby) {
            var out = [];
            var raw = index.rubynomRaw;
            var foldedPrefix = asciiFold(prefixLower);
            for (var i = 0; i < raw.length; i++) {
                var word = raw[i][0], ruby = raw[i][1], level = raw[i][2];
                if (level <= 1) continue;
                if (ruby === excludeRuby) continue;
                if (asciiFold(ruby).indexOf(foldedPrefix) !== 0) continue;
                out.push([word, ruby]);
            }
            return out;
        };
    }

    // ---- Drop-in replacement for selExample's query ----
    function makeSelExampleLookupJS(index) {
        // Replaces: SELECT cword, crubynom FROM cmpnom WHERE crubynom LIKE
        // 'ruby %' OR crubynom LIKE '% ruby' OR crubynom LIKE '% ruby %'
        // ORDER BY rowid, then caller filters cword.indexOf(word) > -1.
        // Low-frequency (SHIFT key only), so a linear scan is fine at this
        // data size — no index structure needed.
        return function selExampleLookupJS(word, ruby) {
            var out = [];
            var raw = index.cmpRaw;
            var folded = index.cmpRawFoldedCruby;
            var foldedRuby = asciiFold(ruby);
            var pStart = foldedRuby + ' ';
            var pEnd = ' ' + foldedRuby;
            var pMid = ' ' + foldedRuby + ' ';
            for (var i = 0; i < raw.length; i++) {
                var cword = raw[i][0], crubynom = raw[i][1];
                var foldedCrubynom = folded[i];
                if (foldedCrubynom.indexOf(pStart) === 0 ||
                    foldedCrubynom.slice(-pEnd.length) === pEnd ||
                    foldedCrubynom.indexOf(pMid) !== -1) {
                    // cword.indexOf(word) is plain JS in the original too
                    // (not part of the SQL query) — stays case-sensitive.
                    if (cword.indexOf(word) > -1) {
                        out.push([cword, stripBom(crubynom)]);
                    }
                }
            }
            return out;
        };
    }

    function init(data) {
        var index = buildIndex(data);
        return {
            index: index,
            compoundLookupJS: makeCompoundLookupJS(index),
            dictLookupWordJS: makeDictLookupWordJS(index),
            dictLookupRubyJS: makeDictLookupRubyJS(index),
            rubyExactLookupJS: makeRubyExactLookupJS(index),
            rubyPrefixLookupJS: makeRubyPrefixLookupJS(index),
            selExampleLookupJS: makeSelExampleLookupJS(index)
        };
    }

    var api = { init: init, buildIndex: buildIndex, prefixTrieGet: prefixTrieGet, asciiFold: asciiFold };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api; // Node (regression harness)
    } else {
        root.IMEData = api;   // browser global, consistent with the rest
                               // of the project's plain-script style
    }

})(typeof window !== 'undefined' ? window : globalThis);
