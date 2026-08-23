// Minimal replacement for jQuery's $(el).css({...}) — sets each style
// property via CSSStyleDeclaration.setProperty so hyphenated CSS property
// names (e.g. 'font-family', 'writing-mode') work without conversion to
// camelCase.
function $css(el, props) {
    for (var key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key)) {
            el.style.setProperty(key, props[key]);
        }
    }
}

// Memoized document.getElementById — the elements this project looks up
// repeatedly (txtPad, rubytype, w1-w9, etc.) are static markup in index.html
// that's never recreated, so caching by id is safe.
var _elCache = {};
function $id(id) {
    return _elCache[id] || (_elCache[id] = document.getElementById(id));
}

var shiftbool = false;
var kblist = ["E→文", "E→P", "P→文"];
var keyboard = 0;
var contents = [];
var condb;

// Composition-state cluster: transient state tracking the in-progress
// compound-word search across keystrokes while the user is composing a
// candidate. Read/written across resetComposition, txtPadKeyTyped,
// txtPadKeyInput, putWord, upPage/dnPage, addSelCompound, and delList.
// queue/tail form a two-slot accumulator of already-matched compound text;
// cSz/qSz/rSz/tqSz/trSz are an ascending threshold ladder (cSz <= qSz <=
// rSz <= tqSz <= trSz) that the SPACE-key handlers walk to decide, based on
// which candidate slot the user picked, whether to keep accumulating,
// reset, or roll over into the secondary "tail" compound match. lenTmp is
// staged by the SPACE handlers from the just-selected candidate's length,
// then consumed into lenBuf by addSelCompound() on the next keystroke.
// See OPEN_ITEMS_REVIEW.md for the audit that identified this cluster.
var conState = {
    queue: "",      // was conqueue
    tail: "",       // was contail
    lenBuf: 0,      // was conlenbuf
    lenTmp: 0,      // was conlentmp
    lenTail: 0,     // was conlentail
    cSz: 0,         // was concSz
    qSz: 0,         // was conqSz
    rSz: 0,         // was conrSz
    tqSz: 0,        // was contqSz
    trSz: 0         // was contrSz
};
var curtxtPadlength = 0; // tracks txtPad length between keystrokes for touch-input diffing (see txtPadKeyInput)

var lentype = 0;
var carpos = -1;
var optionlist = [];
var selectedindex = 0;
var pgBe = 0;
var pgEn = 0;
var bPgup = false;
var bPgdn = false;
var opttable = "rubynom";
var optruby = "ruby";
var optlev = "and level>1";
var sugCB = false;

var oo = false;

// Connect to sqlite db file
var xhr = new XMLHttpRequest();
xhr.open('GET', './Resources/imenom.jpg', true);
xhr.responseType = 'arraybuffer';

xhr.onload = function () {
    try {
        var uInt8Array = new Uint8Array(this.response);
        condb = new SQL.Database(uInt8Array);
        console.log("imenom loaded");
    } catch (err) {
        console.error("Failed to open imenom:", err);
    }

    $css($id("waitscreen"), { display: "none" });
    $id("txtPad").focus();
};

xhr.onerror = function () {
    console.error("Failed to load imenom.jpg");
    $css($id("waitscreen"), { display: "none" });
};

xhr.send();

// Escapes single quotes for inclusion in a SQL string literal (SQLite-style:
// doubling the quote rather than backslash-escaping it).
function sqlEscape(str) {
    return str.replace(/\'/g, "''");
}

function optkeyboard(kbsel) {
    keyboard = kbsel;
    $id("kbname").innerHTML = kblist[kbsel];
    $id("txtPad").focus();
}

//keydown
// Clears the in-progress composition (rubytype buffer, candidate queue, and
// candidate list). Shared by the CTRL/ESC handler, the arrow-key-with-no-
// candidates handler, and the touch-input max-length handler.
function resetComposition() {
    conState.tail = conState.queue = "";
    conState.lenBuf = 0;
    delList();
    $id("rubytype").innerHTML = "";
    lentype = 0;
}

function txtPadKeyPressed(evt) {
    var evtK = evt.keyCode || evt.charCode;
    var txtPadEl = $id("txtPad");
    var rubytypeEl = $id("rubytype");
    if ((evtK == 17) || (evtK == 27) || ([...rubytypeEl.textContent].length >= 12)) { //CTRL or ESC
        resetComposition();
        return;
    }
    // SHIFT
    if (evtK == 16) {
        if (!shiftbool) {
            shiftbool = true;
            var ind = selectedindex;
            if (ind > 0) {
                selExample($id("w" + ind).textContent, rubytypeEl.textContent);
                return;
            }
            var selstart = txtPadEl.selectionStart;
            var selend = txtPadEl.selectionEnd;
            var subtxt = txtPadEl.value.substring(selstart, selend);
            if (subtxt.length > 0)
                $id("example").innerHTML = "<table><tr><td>" + logo2phon(subtxt, 20) + "</td></tr></table>";
        }
    }

    if (optionlist.length != 0) {
        if (evtK == 38) {   //UP
            var ind = selectedindex;
            if (ind > 0) {
                if (bPgup && (ind == 1)) {
                    upPage();
                    setSelectedIndex(9);
                    if (carpos == -1)
                        carpos = txtPadEl.selectionEnd;
                    return;
                }
                setSelectedIndex(ind - 1);
                if (carpos == -1)
                    carpos = txtPadEl.selectionEnd;
                return;
            }
        }
        if (evtK == 40) {   //DOWN
            var ind = selectedindex;
            if (ind > 0) {
                if (bPgdn && (ind == 9)) {
                    dnPage();
                    setSelectedIndex(1);
                    if (carpos == -1)
                        carpos = txtPadEl.selectionEnd;
                    return;
                }
                setSelectedIndex(ind + 1);
                if (carpos == -1)
                    carpos = txtPadEl.selectionEnd;
                return;
            }
        }
        if (evtK == 39) { //RIGHT
            rightopt();
            return;
        }
        if (evtK == 37) { //LEFT
            leftopt();
            return;
        }
    } else {
        if ((evtK >= 37) && (evtK <= 40)) {
            resetComposition();
            return;
        }
    }

    var rubystr = rubytypeEl.textContent;
    var utf = 1;
    var rt = rubystr.charCodeAt(rubystr.length - 1);
    if ((rt >= 0xD800) && (rt <= 0xDFFF))
        utf = 2;
    if (evtK == 8) {    //BKSPC
        if (rubystr.length > 0) {
            rubytypeEl.innerHTML = rubystr.substring(0, rubystr.length - utf);
            lentype--;
        } else
            lentype = 0;
        listUpdate();
    }

}

//keytype
function txtPadKeyTyped(evt) {
    var evtK = evt.keyCode || evt.charCode;
    var evtC = String.fromCharCode(evtK);
    var txtPadEl = $id("txtPad");
    var rubytypeEl = $id("rubytype");
    var rubystr = rubytypeEl.textContent;
    if (evtK == 13) {   //ENTER
        rubytypeEl.innerHTML = "";
        listUpdate();
        lentype = 0;
        return;
    }
    var ind = selectedindex - 1;
    var tonechar = toneNumb(evtC);
    if ((optionlist.length != 0) && !isNaN(parseInt(tonechar)) && (evtC != tonechar)) {   //SHIFT + Num
        var selnum = parseInt(tonechar);
        evt.preventDefault();
        conState.queue = conState.tail = "";
        if (selnum == 0) {
            putWord(rubystr);
            return;
        }
        if (optionlist.length >= selnum) {
            if ((selnum > conState.rSz) && (selnum <= conState.trSz))
                conState.lenBuf = conState.lenTail;
            if (selnum > conState.trSz)
                conState.lenBuf = 0;
            putWord($id("w" + selnum).textContent);
        } else {
            var txtarea = txtPadEl.value;
            var caretend = txtPadEl.selectionEnd;
            txtPadEl.value = txtarea.substring(0, caretend) + evtC + txtarea.substring(caretend, txtarea.length);
            txtPadEl.selectionStart = txtPadEl.selectionEnd = caretend + evtC.length;
            rubytypeEl.innerHTML = "";
            lentype = 0;
            delList();
        }
        conState.queue = conState.tail = "";
        conState.lenBuf = 0;
        return;
    } else if (evtK == 32) {    //SPACE
        if (optionlist.length == 1) {
            rubytypeEl.innerHTML = rubystr + " ";
            listUpdate();
        }
        if (ind < conState.cSz) {
            if (conState.cSz == conState.qSz)
                conState.queue = "";
            else
                conState.queue = conState.queue + rubystr + " ";
            conState.tail = "";
        } else if (ind < conState.qSz) {
            conState.queue = conState.queue + rubystr + " ";
            conState.tail = rubystr + " ";
        } else if (ind < conState.rSz)
            conState.queue = conState.tail = "";
        else if (ind < conState.tqSz) {
            conState.lenBuf = conState.lenTail;
            conState.queue = conState.tail + rubystr + " ";
            conState.tail = rubystr + " ";
        } else if (ind < conState.trSz) {
            conState.lenBuf = conState.lenTail;
            conState.queue = conState.tail = "";
        } else {
            conState.queue = rubystr + " ";
            conState.tail = "";
            conState.lenBuf = 0;
        }
        if (optionlist.length != 0) {
            evt.preventDefault();
            conState.lenTmp = $id("w" + selectedindex).textContent.length;
            putWord($id("w" + selectedindex).textContent);
        }
        txtPadEl.focus();
        return;
    } else if (((evtK > 31) && (evtK < 39)) || ((evtK > 39) && (evtK < 48)) || ((evtK > 57) && (evtK < 65)) || ((evtK > 90) && (evtK < 96)) || ((evtK > 122) && (evtK < 127))) {    //Punctuation
        if ((ind >= conState.rSz) && (ind < conState.trSz))
            conState.lenBuf = conState.lenTail;
        if (ind >= conState.trSz)
            conState.lenBuf = 0;
        if (optionlist.length != 0) {
            putWord($id("w" + selectedindex).textContent);
        }
        conState.queue = conState.tail = "";
        conState.lenBuf = 0;
        lentype = 0;
        lentype++;
        rubytypeEl.innerHTML = typeChar(rubytypeEl.textContent, evtC);
    } else if (evtK != 8) {
        lentype++;
        rubytypeEl.innerHTML = typeChar(rubytypeEl.textContent, evtC);
    }
    listUpdate();
    
}

//keyup
function txtPadKeyReleased(evt) {
    $id("example").innerHTML = "<table><tr><td>"+$id("DictGuide").value+"</td></tr></table>";
    if (carpos != -1) {
        $id('txtPad').selectionStart = carpos;
        $id('txtPad').selectionEnd = carpos;
        carpos = -1;
    }
    var evtK = evt.keyCode || evt.charCode;
    if (evtK == 16)
        shiftbool = false;
}

function rightopt() {
    if (bPgdn) {
        dnPage();
        setSelectedIndex(1);
    }
    if (carpos == -1)
        carpos = $id('txtPad').selectionEnd;
    return;
}

function leftopt() {
    if (bPgup) {
        upPage();
        setSelectedIndex(1);
    }
    if (carpos == -1)
        carpos = $id('txtPad').selectionEnd;
    return;
}

// Touch-input handler: mobile/touch keyboards don't reliably report keyCode on
// keydown/keypress, so composition here is inferred by diffing txtPad's value
// on 'keyup' instead of reading key events directly (contrast with
// txtPadKeyPressed/txtPadKeyTyped, which handle the same job for physical
// keyboards). Wired up conditionally in index.html based on touch support.
function txtPadKeyInput(evt) {
    var evtK = evt.keyCode || evt.charCode;
    var txtPadEl = $id("txtPad");
    var rubytypeEl = $id("rubytype");
    var rubystr = rubytypeEl.textContent;
    var curcaret = txtPadEl.selectionEnd;
    var newtxtPadlength = txtPadEl.value.length;

    // Max composition length
    if ([...rubystr].length >= 12) {
        resetComposition();
        return;
    }

    // BACKSPACE
    if (newtxtPadlength < curtxtPadlength) {
        if (curtxtPadlength - newtxtPadlength > 1) {
            rubytypeEl.innerHTML = "";
            listUpdate();
            lentype = 0;
            curtxtPadlength = txtPadEl.value.length;
            return;
        }
        if (rubystr.length > 0) {
            rubytypeEl.innerHTML = rubystr.substring(0, rubystr.length - 1);
            lentype--;
        } else {
            lentype = 0;
        }
        listUpdate();
        curtxtPadlength = txtPadEl.value.length;
        return;
    }

    // CHARACTER INPUT
    if (newtxtPadlength > curtxtPadlength) {
        var evtC = txtPadEl.value.substring(curcaret - 1, curcaret);

        // ENTER
        if (evtK == 13) {
            rubytypeEl.innerHTML = "";
            listUpdate();
            lentype = 0;
            curtxtPadlength = txtPadEl.value.length;
            return;
        }

        var ind = selectedindex - 1;

        // SPACE
        if (evtC == ' ') {
            txtPadEl.value = txtPadEl.value.substring(0, curcaret - 1) + txtPadEl.value.substring(curcaret, txtPadEl.value.length);
            txtPadEl.selectionStart = txtPadEl.selectionEnd = curcaret - 1;
            // Composition-state threshold ladder — mirrors txtPadKeyTyped's
            // SPACE handler. Without this, conState.queue never becomes
            // non-empty on the touch path, so addSelCompound()'s
            // "if (conState.queue == '') return;" guard always fires and
            // compound-word search silently never runs on touch input. See
            // OPEN_ITEMS_REVIEW.md, "txtPadKeyInput ladder gap".
            if (ind < conState.cSz) {
                if (conState.cSz == conState.qSz)
                    conState.queue = "";
                else
                    conState.queue = conState.queue + rubystr + " ";
                conState.tail = "";
            } else if (ind < conState.qSz) {
                conState.queue = conState.queue + rubystr + " ";
                conState.tail = rubystr + " ";
            } else if (ind < conState.rSz)
                conState.queue = conState.tail = "";
            else if (ind < conState.tqSz) {
                conState.lenBuf = conState.lenTail;
                conState.queue = conState.tail + rubystr + " ";
                conState.tail = rubystr + " ";
            } else if (ind < conState.trSz) {
                conState.lenBuf = conState.lenTail;
                conState.queue = conState.tail = "";
            } else {
                conState.queue = rubystr + " ";
                conState.tail = "";
                conState.lenBuf = 0;
            }
            if (optionlist.length != 0) {
                evt.preventDefault();
                var wordEl = $id("w" + selectedindex);
                conState.lenTmp = wordEl.textContent.length;
                putWord(wordEl.textContent);
            }
            curtxtPadlength = txtPadEl.value.length;
            txtPadEl.focus();
            return;
        }

        // Punctuation
        else if ((evtC == '.') || (evtC == ',')) {
            txtPadEl.value = txtPadEl.value.substring(0, curcaret - 1) + evtC + txtPadEl.value.substring(curcaret, txtPadEl.value.length);
            txtPadEl.selectionStart = txtPadEl.selectionEnd = curcaret - 1;
            if ((ind >= conState.rSz) && (ind < conState.trSz))
                conState.lenBuf = conState.lenTail;
            if (ind >= conState.trSz)
                conState.lenBuf = 0;
            if (optionlist.length != 0) {
                putWord($id("w" + selectedindex).textContent);
            }
            conState.queue = "";
            conState.tail = "";
            conState.lenBuf = 0;
            lentype = 0;
            txtPadEl.selectionStart = txtPadEl.selectionEnd = txtPadEl.selectionEnd + 1;
            lentype++;
            rubytypeEl.innerHTML = typeChar(rubytypeEl.textContent, evtC);
        }

        // Normal character
        else if (evtK != 8) {
            lentype++;
            rubytypeEl.innerHTML = typeChar(rubytypeEl.textContent, evtC);
        }

        listUpdate();
        curtxtPadlength = txtPadEl.value.length;
        return;
    }
}

function putWord(instr) {
    var txtPadEl = $id("txtPad");
    var txtarea = txtPadEl.value;
    txtPadEl.selectionStart = txtPadEl.selectionEnd - lentype - conState.lenBuf;
    var caretbeg = txtPadEl.selectionStart;
    var caretend = txtPadEl.selectionEnd;
    txtPadEl.value = txtarea.substring(0, caretbeg) + instr + txtarea.substring(caretend, txtarea.length);
    conState.lenBuf = 0;
    txtPadEl.selectionStart = txtPadEl.selectionEnd = caretbeg + instr.length;
    $id("rubytype").innerHTML = "";
    lentype = 0;
    delList();
}

function upPage() {
    pgEn = pgBe;
    pgBe -= 9;
    conState.qSz += 9;
    conState.cSz += 9;
    conState.rSz += 9;
    conState.tqSz += 9;
    conState.trSz += 9;
    bPgdn = true;
    if (pgBe == 0) {
        bPgup = false;
        bPgdn = true;
    }
    var optionsublist = optionlist.slice(pgBe, pgEn);
    var i;
    for (i = 1; i <= 9; i++) {
        $id("w" + i).innerHTML = optionsublist[i - 1];
    }
}

function dnPage() {
    pgBe += 9;
    conState.qSz -= 9;
    conState.cSz -= 9;
    conState.rSz -= 9;
    conState.tqSz -= 9;
    conState.trSz -= 9;
    bPgup = true;
    var optionsublist;
    var i;
    if (optionlist.length > (9 + pgBe)) {
        pgEn = pgBe + 9;
        optionsublist = optionlist.slice(pgBe, pgEn);
        for (i = 1; i <= 9; i++) {
            $id("w" + i).innerHTML = optionsublist[i - 1];
        }
    } else {
        pgEn = optionlist.length;
        bPgdn = false;
        optionsublist = optionlist.slice(pgBe, pgEn);
        var listsize = pgEn - pgBe;
        whitelist();
        for (i = 1; i <= listsize; i++) {
            $id("w" + i).innerHTML = optionsublist[i - 1];
        }
    }
}

//Parse selRuby results from db to optionlist
function addSelRuby(ruby) {
    var cubo = [];
    if (keyboard == 1) {
        cubo.push(ruby);
        optionlist = optionlist.concat(cubo);
        return;
    }

    if (ruby == ".") {
        cubo.push("。");
        cubo.push("．");
        cubo.push("：");
        cubo.push("？");
        cubo.push("…");
        cubo.push(ruby);
        optionlist = optionlist.concat(cubo);
        return;
    }

    if (ruby == ",") {
        cubo.push("、");
        cubo.push("，");
        cubo.push("；");
        cubo.push("！");
        cubo.push("　");
        cubo.push(ruby);
        optionlist = optionlist.concat(cubo);
        return;
    }

    contents = condb.exec("SELECT word FROM " + opttable + " WHERE " + optruby + " = '" + sqlEscape(ruby).toLowerCase() + "' " + optlev + " order by level desc");
    if (contents.length != 0) {
        var i = 0;
        for (i = 0; i < contents[0].values.length; i++) {
            cubo.push(contents[0].values[i]);
        }
    }

    if (sugCB) {
        contents = condb.exec("select word, ruby from " + opttable + " where " + optruby + " like '" + sqlEscape(ruby).toLowerCase() + "%' and " + optruby + "!='" + ruby + "' " + optlev + " order by rowid");
        if (contents.length != 0) {
            if (cubo.length > 0)
                cubo.push(ruby);
            for (i = 0; i < contents[0].values.length; i++) {
                cubo.push(contents[0].values[i][0] + ' ' + contents[0].values[i][1]);
            }
        }
    }

    cubo.push(ruby);
    optionlist = optionlist.concat(cubo);
}

//Parse selCompound results from db to optionlist
function addSelCompound(ruby) {
    if ((conState.queue == "") || (keyboard == 1))
        return;
    var optta = opttable;
    var cruby = conState.queue + ruby;
    var csize = cruby.split(" ").length;
    var rawcubo = [];

    var r = compoundLookup("c" + optta, "cword", sqlEscape(cruby), csize, " ", ":", "", rawcubo);
    rawcubo = r.pcubo;
    conState.cSz = r.excSz;
    conState.qSz = r.excSz + (r.prefixFound ? 1 : 0);
    conState.rSz = r.prefixFound ? r.finalSz : r.excSz;
    if ((r.excSz > 0) || r.prefixFound)
        conState.lenBuf = conState.lenTmp;
    if (r.prefixFound)
        conState.lenTail = rawcubo[r.excSz][csize - 1].length;

    if (conState.tail != "") {
        var truby = conState.tail + ruby;
        var tsize = truby.split(" ").length;
        var r2 = compoundLookup("c" + optta, "cword", sqlEscape(truby), tsize, " ", ":", "", rawcubo);
        rawcubo = r2.pcubo;
        if ((r2.excSz > 0) || r2.prefixFound)
            conState.lenBuf = conState.lenTmp;
        if (r2.prefixFound) {
            conState.tqSz++;
            conState.trSz = r2.finalSz;
            conState.lenTail = rawcubo[r2.excSz][tsize - 1].length;
        }
    }

    var cubo = rawcubo.map(function (arr) { return arr.join(""); });
    optionlist = optionlist.concat(cubo);
}

function convertpad(direction, maxlevel) {
    var convtxt = "";
    var txtPadEl = $id("txtPad");
    switch (direction) {
        case 0:
            convtxt = logo2phon(txtPadEl.value, maxlevel);
            break;
        case 1:
            convtxt = phon2logo(txtPadEl.value, maxlevel);
            break;
        default: break;
    }
    if (convtxt.length > 0) {
        var txtPadoutEl = $id("txtPadout");
        $css(txtPadEl, { 'width': '50%' });
        $css(txtPadoutEl, { 'writing-mode': 'horizontal-tb' });
        $css(txtPadoutEl, { 'display': 'block' });
        txtPadoutEl.innerHTML = convtxt.replace(/\n/g, " <br> ");
		$css($id("copy_button"), { 'display': 'block' });
    } else {
        offpad();
    }
}


function focuspad() {
    if ($id("txtPadout").innerHTML == "") {
        offpad();
    }
}

function offpad() {
        $css($id("txtPadout"), { 'display': 'none' });
        $css($id("txtPadout"), { 'writing-mode': 'horizontal-tb' });
		$css($id("copy_button"), { 'display': 'none' });
        $css($id("txtPad"), { 'width': '100%' });
}
function logo2phon(pad, maxlevel) {
    if (pad == "")
        return "";
    var cubo = selPhone(pad, maxlevel, true);
    var i;
    var ttt;
    ttt = cubo[0].replace(/\$/g, "");
    for (i = 1; i < cubo.length; i++) {
        var nextword = "";
        nextword = cubo[i];
        
        if (nextword.startsWith('$')) {
            nextword = cubo[i].substring(1);
            if ("。、，：；？！…".includes(nextword)) {
                nextword = nextword.replace(/。/g, ".");
                nextword = nextword.replace(/、/g, ",");
                nextword = nextword.replace(/：/g, ":");
                nextword = nextword.replace(/；/g, ";");
                nextword = nextword.replace(/？/g, "?");
                nextword = nextword.replace(/！/g, "!");
                nextword = nextword.replace(/，/g, ",");
            }
            ttt = ttt + nextword;
        }
        else if (ttt.slice(-1) == "\n")
            ttt = ttt + nextword;
        else
            ttt = ttt + " " + nextword;
    }
    return ttt;
}


function phon2logo(pad, maxlevel) {
    if (pad == "")
        return "";
    var cubo = selChar(pad, maxlevel, true);
    var i;
    var ttt = cubo[0];
    for (i = 1; i < cubo.length; i++) {
        ttt = ttt + cubo[i];
    }
    return ttt;
}

// Compound-word "exact key" + "key + more" prefix lookup against cmpnom.
// Shared by selPhone (matches on cword, the Sino/Nom side, joined with
// ":") and selChar (matches on c<opttable>, the Quoc Ngu/ruby side,
// joined with " "). Appends results onto pcubo and returns the counts
// the caller's state dispatch needs.
//   matchCol/selectCol : cmpnom columns to match against / read from
//   key                : match key, already escaped by the caller (both
//                        selPhone and selChar pass sqlEscape(key))
//   size               : number of pieces the exact-match value is truncated to
//   matchDelim         : delimiter used for the "LIKE key<delim>%" prefix search
//   splitDelim         : delimiter used to split selectCol's stored value
//   extraGuard         : extra WHERE-clause fragment (selPhone's NOT NULL/
//                        empty checks), or "" (selChar has none)
function compoundLookup(matchCol, selectCol, key, size, matchDelim, splitDelim, extraGuard, pcubo) {
    var contents = condb.exec("SELECT " + selectCol + ", " + matchCol + " FROM cmpnom WHERE " + matchCol + " = '" + key + "'" + extraGuard);
    var i, j, split = null;
    if (contents.length != 0) {
        for (i = 0; i < contents[0].values.length; i++) {
            split = contents[0].values[i][0].split(splitDelim);
            var xstr = [];
            for (j = 0; j != size; j++)
                xstr.push(split[j]);
            pcubo.push(xstr);
        }
    }
    var excSz = pcubo.length;

    contents = condb.exec("SELECT " + selectCol + ", " + matchCol + " FROM cmpnom WHERE " + matchCol + " like '" + key + matchDelim + "%'" + extraGuard + " ORDER BY rowid");
    split = null;
    var rubo = [];
    if (contents.length != 0) {
        for (i = 0; i < contents[0].values.length; i++) {
            split = contents[0].values[i][0].split(splitDelim);
            var xstr2 = [];
            for (j = 0; j != split.length; j++)
                xstr2.push(split[j]);
            rubo.push(xstr2);
        }
    }
    var prefixFound = (split != null);
    var finalSz = excSz;
    if (prefixFound) {
        var xstr3 = [];
        for (i = 0; i != size; i++)
            xstr3.push(split[i]);
        pcubo.push(xstr3);
        pcubo = pcubo.concat(rubo);
        finalSz = pcubo.length;
    }
    return { pcubo: pcubo, excSz: excSz, prefixFound: prefixFound, finalSz: finalSz };
}

// Shared by selPhone and selChar: for one character/word step of their
// per-unit loop, looks up compound matches for the queue (buffer built
// so far) and tail (current prefix candidate) extended by fullchar, then
// advances queue/tail based on what compoundLookup found. This is the
// same 6-branch dispatch chain (c/q/r/tq/tr/else) used at module
// scope by the SPACE-key handler in txtPadKeyTyped, but driven by
// "did this step's lookup find anything" rather than "is the selected
// index inside this bucket" — so it is not merged with that one.
//   queue/tail  : current compound-match buffers (strings)
//   fullchar    : the character/word unit being appended this step
//   matchCol/selectCol/delim/splitDelim/guard/escapeKey : same roles as
//                 compoundLookup's params; delim is also the unit-join
//                 delimiter (":" for selPhone, " " for selChar)
// Returns { queue, tail, cubo } for the caller to assign back.
function advanceCompoundWindow(queue, tail, fullchar, matchCol, selectCol, delim, splitDelim, guard, escapeKey) {
    var cSz = 0, qSz = 0, rSz = 0, tqSz = 0, trSz = 0;
    var cubo = [];

    if (queue != "") {
        var cfullchar = queue + fullchar;
        var csize = cfullchar.split(delim).length;
        var key = escapeKey ? sqlEscape(cfullchar) : cfullchar;
        var r = compoundLookup(matchCol, selectCol, key, csize, delim, splitDelim, guard, cubo);
        cubo = r.pcubo;
        cSz = r.excSz;
        qSz = r.excSz + (r.prefixFound ? 1 : 0);
        rSz = r.prefixFound ? r.finalSz : r.excSz;

        if (tail != "") {
            var truby = tail + fullchar;
            var tsize = truby.split(delim).length;
            var tkey = escapeKey ? sqlEscape(truby) : truby;
            var r2 = compoundLookup(matchCol, selectCol, tkey, tsize, delim, splitDelim, guard, cubo);
            cubo = r2.pcubo;
            if (r2.prefixFound) {
                tqSz++;
                trSz = r2.finalSz;
            }
        }
    }

    if (cSz > 0) {
        queue = (cSz == qSz) ? "" : (queue + fullchar + delim);
        tail = "";
    } else if (qSz > 0) {
        queue = queue + fullchar + delim;
        tail = fullchar + delim;
    } else if (rSz > 0) {
        queue = tail = "";
    } else if (tqSz > 0) {
        queue = tail + fullchar + delim;
        tail = fullchar + delim;
    } else if (trSz > 0) {
        queue = tail = "";
    } else {
        queue = fullchar + delim;
        tail = "";
        cubo = [];
    }

    return { queue: queue, tail: tail, cubo: cubo };
}

// Shared by selPhone and selChar: resolves one lexical unit (a Sino/Nom
// character for selPhone, a space-delimited token for selChar) against
// compound matches (via advanceCompoundWindow) and, failing that, a direct
// dictionary lookup — then splices the result into outputarr using the same
// pop/push dance both callers relied on (a compound match replaces however
// many outputarr entries its previous units occupied with the compound's
// own unit-count).
//   fullchar     : lookup key for this unit (already case-folded by caller)
//   dictSql      : caller-built SQL for the direct dictionary lookup
//                  (caller is responsible for escaping fullchar within it)
//   ext          : whether to append all alternate dictionary matches,
//                  joined by "/"
//   fallback     : value to push when neither compound nor dictionary match
//   compoundArgs : { matchCol, selectCol, delim, splitDelim, guard, escapeKey }
//                  — same roles as advanceCompoundWindow's params
// Returns { pconqueue, pcontail } for the caller's next iteration; mutates
// outputarr in place.
function resolveUnit(pconqueue, pcontail, fullchar, dictSql, ext, fallback, compoundArgs, outputarr) {
    var step = advanceCompoundWindow(pconqueue, pcontail, fullchar,
        compoundArgs.matchCol, compoundArgs.selectCol, compoundArgs.delim,
        compoundArgs.splitDelim, compoundArgs.guard, compoundArgs.escapeKey);
    var pcubo = step.cubo;

    var sss = "";
    var contents = condb.exec(dictSql);
    if (contents.length != 0) {
        sss = contents[0].values[0][0];
        if (ext) {
            for (var q = 1; q < contents[0].values.length; q++) {
                sss = sss + "/" + contents[0].values[q][0];
            }
        }
    }

    if (pcubo.length != 0) {
        for (var q = 1; q < pcubo[0].length; q++) {
            outputarr.pop();
        }
        for (var q = 0; q != pcubo[0].length; q++) {
            outputarr.push(pcubo[0][q]);
        }
    } else {
        outputarr.push(sss.length > 0 ? sss : fallback);
    }

    return { pconqueue: step.queue, pcontail: step.tail };
}

function selPhone(phrase, maxlevel, defa){
    var ext = !defa;
    if ((phrase.length == 1) && defa)
        ext = true;
    var outputarr = [];
    var word = phrase;
    var k;
    var fullchar;

    var pcontail = "";
    var pconqueue = "";

    var optta = opttable;
    var guard = " AND c" + optta + " <> '' AND c" + optta + " IS NOT NULL";

    for (k = 0; k != word.length; k++) {
        if ((word[k].charCodeAt(0) < 0xD800) || (word[k].charCodeAt(0) >= 0xE000)) {
            fullchar = word[k];
        } else {
            fullchar = word[k] + word[k + 1];
            //sql = "select "+optruby+" from "+opttable+" where HEX(word)='"+SuppChar.asHex(word2)+"' order by level desc";
            if ((phrase.length == 2) && !ext)
                ext = true;
            k++;
        }

        var dictSql = "select " + optruby + ", (level % " + maxlevel + ") from " + opttable +
            " where word='" + sqlEscape(fullchar) + "' order by (level % " + maxlevel + ") desc";

        var step = resolveUnit(pconqueue, pcontail, fullchar, dictSql, ext, "$" + fullchar,
            { matchCol: "cword", selectCol: "c" + optta, delim: ":", splitDelim: " ", guard: guard, escapeKey: true },
            outputarr);
        pconqueue = step.pconqueue;
        pcontail = step.pcontail;
    }

    return outputarr;
}

function selChar(phrase, maxlevel, defa) {
    var ext = !defa;
    if ((phrase.length == 1) && defa)
        ext = true;
    var outputarr = [];
    phrase = phrase.replace(/\./g, " 。 ");
    phrase = phrase.replace(/,/g, " 、 ");
    phrase = phrase.replace(/:/g, " ： ");
    phrase = phrase.replace(/;/g, " ； ");
    phrase = phrase.replace(/\?/g, " ？ ");
    phrase = phrase.replace(/!/g, " ！ ");
    phrase = phrase.replace(/\t/g, " \t ");
    phrase = phrase.replace(/\n/g, " \n ");
    phrase = phrase.replace(/\r/g, " \r ");
    var word = phrase.split(" ");
    word = word.filter(function (a) { return a !== '' });
    var k;
    var fullcharcase;
    var fullchar;

    var pcontail = "";
    var pconqueue = "";

    var optta = opttable;

    for (k = 0; k != word.length; k++) {
        fullcharcase = word[k];
        fullchar = fullcharcase.toLowerCase();

        var dictSql = "select word,(level % " + maxlevel + ") from " + opttable +
            " where " + optruby + "='" + sqlEscape(fullchar) + "' order by (level % " + maxlevel + ") desc";

        var step = resolveUnit(pconqueue, pcontail, fullchar, dictSql, ext, fullcharcase,
            { matchCol: "c" + optta, selectCol: "cword", delim: " ", splitDelim: ":", guard: "", escapeKey: true },
            outputarr);
        pconqueue = step.pconqueue;
        pcontail = step.pcontail;
    }

    return outputarr;
}

function selExample(word, ruby) {
    var cubo = [];
    var i;
    var cubostr = "<table>";
    contents = condb.exec("SELECT cword, c" + opttable + " FROM cmpnom WHERE c" + opttable + " LIKE '" + sqlEscape(ruby) + " %' OR c" + opttable + " LIKE '% " + sqlEscape(ruby) + "' OR c" + opttable + " LIKE '% " + sqlEscape(ruby) + " %' ORDER BY rowid");
    if (contents.length != 0) {
        for (i = 0; i < contents[0].values.length; i++) {
            if (contents[0].values[i][0].indexOf(word) > -1) {
                cubostr += "<tr><td>" + contents[0].values[i][0].replace(/:/g, "") + "</td><td>" + contents[0].values[i][1] + "</td></tr>";
            }
        }
    }
    cubostr += "</table>";
    $id("example").innerHTML = cubostr;
    return;
}
function listUpdate() {
    var rubystr = $id("rubytype").textContent;
    delList();
    if (rubystr == "")
        return;

    addSelCompound(rubystr.toLowerCase());
    addSelRuby(rubystr.toLowerCase());
    if (optionlist.length > 9) {
        bPgdn = true;
        var i;
        for (i = 1; i <= 9; i++) {
            $id("w" + i).innerHTML = optionlist[i - 1];
        }
        setSelectedIndex(1);
    } else {
        var i;
        whitelist();
        for (i = 1; i <= optionlist.length; i++) {
            $id("w" + i).innerHTML = optionlist[i - 1];
        }
        setSelectedIndex(1);
    }

}

function delList() {
    optionlist = [];
    conState.qSz = conState.rSz = conState.cSz = conState.tqSz = conState.trSz = 0;
    selectedindex = 0;
    pgBe = 0;
    pgEn = 0;
    bPgup = false;
    bPgdn = false;
    whitelist();
}

// Resets every candidate option (.outopt) to its unselected appearance.
function clearHighlight() {
    document.querySelectorAll(".outopt").forEach(function(el) { $css(el, { 'background': 'none', 'color': '#f0e0c0' }); });
}

function whitelist() {
    clearHighlight();
    for (var i = 1; i <= 9; i++) {
        $id("w" + i).innerHTML = "";
    }
}

function setSelectedIndex(ind) {
    if ($id("w" + ind).textContent != "") {
        selectedindex = ind;
        clearHighlight();
        $css($id("w" + ind), { 'background': '#eee', 'color': '#000' });
    }
    $id("txtPad").focus();
}

var toneNumbMap = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
    '^': '6', '&': '7', '*': '8', '(': '9', ')': '0'
};
function toneNumb(tonechar) {
    if (Object.prototype.hasOwnProperty.call(toneNumbMap, tonechar))
        return toneNumbMap[tonechar];
    return tonechar;
}
function typeChar(text, ch) {
    if (keyboard != 2) {
        return TELEX(text, ch);
    }
    return text + ch;
}

// Attempts to apply the mcTELEX modifier `ch` to the character at `idx`
// in `a`. Returns the resulting string if a change was made — either a
// deletion (mcTELEX signals removal with an empty-string result) or a
// diacritic substitution, with the shared `oo` side-effect flag honored
// only when `checkOo` is true, matching each call site's original
// behavior. Returns null if the character at `idx` was unaffected by
// `ch`, so the caller can fall through to the next candidate position.
function applyTelexAt(a, idx, ch, checkOo) {
    var nc = mcTELEX(a[idx], ch);
    if (nc == "")
        return a.substring(0, idx) + a.substring(idx + 1);
    if (a[idx] != nc) {
        var result = a.substring(0, idx) + nc + a.substring(idx + 1);
        if (checkOo && oo) {
            oo = false;
            return result + 'o';
        }
        return result;
    }
    return null;
}

function TELEX(text, ch) {
    if (text.length == 0)
        return text + ch;
    var qu = -1;
    var gi = -1;
    var a = text;
    if (text.startsWith("qu"))
        qu = 1;
    if (text.startsWith("gi"))
        gi = qu = 1;
    var l = text.length - 1;
    if (l > 0) {
        switch (a[l]) {
            case 'y':
                switch (a[l - 1]) {
                    case 'a':
                    case 'â':
                        l--;
                        break;
                }
                break;
            case 'a':
                switch (a[l - 1]) {
                    case 'i':
                        if (gi == -1)
                            l--;
                        break;
                    case 'u':
                        if (ch == 'a')
                            break;
                    case 'ư':
                        if ((qu == -1) || (gi != -1))
                            l--;
                        break;
                    case 'y':
                            l--;
                        break;
                }
                break;
            case 'o':
            case 'ư':
                if ((a[l - 1] == 'u') || (a[l - 1] == 'i'))
                    break;
            case 'u':
                if ((gi == 1) && (a[l - 1] == 'i'))
                    break;
            case 'i':
                if ((qu == 1) && (gi == -1) && (a[l - 1] == 'u'))
                    break;
                var direct = applyTelexAt(a, l - 1, ch, false);
                if (direct !== null)
                    return direct;
                break;
        }
    }
    var i;
    for (i = l; i != qu; i--) {
        var stepped = applyTelexAt(a, i, ch, true);
        if (stepped !== null)
            return stepped;
    }
    if (qu == 1) {
        var tail = applyTelexAt(a, 1, ch, false);
        if (tail !== null)
            return tail;
    }
    return text + ch;
}

// mcTELEX modifier tables: each maps a base char to its diacritic form for
// the given modifier key. Verified equivalent to the prior switch-chain
// implementation via an exhaustive (c, m) enumeration, including the
// oo side-effect flag (see equivalence_check.js in the refactor workspace).
var mcTELEX_HORN = { a: 'ă', o: 'ơ', u: 'ư' }; // m == 'w'

var mcTELEX_TONE = {
    s: { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', â: 'ấ', ă: 'ắ', ô: 'ố', ê: 'ế', ư: 'ứ', ơ: 'ớ', y: 'ý' },
    f: { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', â: 'ầ', ă: 'ằ', ô: 'ồ', ê: 'ề', ư: 'ừ', ơ: 'ờ', y: 'ỳ' },
    j: { a: 'ạ', e: 'ẹ', i: 'ị', o: 'ọ', u: 'ụ', â: 'ậ', ă: 'ặ', ô: 'ộ', ê: 'ệ', ư: 'ự', ơ: 'ợ', y: 'ỵ' },
    x: { a: 'ã', e: 'ẽ', i: 'ĩ', o: 'õ', u: 'ũ', â: 'ẫ', ă: 'ẵ', ô: 'ỗ', ê: 'ễ', ư: 'ữ', ơ: 'ỡ', y: 'ỹ' },
    r: { a: 'ả', e: 'ẻ', i: 'ỉ', o: 'ỏ', u: 'ủ', â: 'ẩ', ă: 'ẳ', ô: 'ổ', ê: 'ể', ư: 'ử', ơ: 'ở', y: 'ỷ' }
};

// m == 'z' (tone-strip / reverse map)
var mcTELEX_TONE_STRIP = {
    'á': 'a', 'à': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ấ': 'â', 'ầ': 'â', 'ẩ': 'â', 'ẫ': 'â', 'ậ': 'â',
    'ắ': 'ă', 'ằ': 'ă', 'ẳ': 'ă', 'ẵ': 'ă', 'ặ': 'ă',
    'é': 'e', 'è': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ế': 'ê', 'ề': 'ê', 'ể': 'ê', 'ễ': 'ê', 'ệ': 'ê',
    'í': 'i', 'ì': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ó': 'o', 'ò': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ố': 'ô', 'ồ': 'ô', 'ổ': 'ô', 'ỗ': 'ô', 'ộ': 'ô',
    'ớ': 'ơ', 'ờ': 'ơ', 'ở': 'ơ', 'ỡ': 'ơ', 'ợ': 'ơ',
    'ú': 'u', 'ù': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ứ': 'ư', 'ừ': 'ư', 'ử': 'ư', 'ữ': 'ư', 'ự': 'ư',
    'ý': 'y', 'ỳ': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y'
};

function mcTELEX(c, m) {
    switch (m) {
        case 'd':
            return (c == 'd') ? 'đ' : c;
        case 'a':
            return (c == 'a') ? 'â' : c;
        case 'e':
            return (c == 'e') ? 'ê' : c;
        case 'o':
            if (c == 'o') return 'ô';
            if (c == 'ô') { oo = true; return 'o'; }
            return c;
        case 'w':
            return mcTELEX_HORN[c] || c;
        case 'z':
            return mcTELEX_TONE_STRIP[c] || c;
        default:
            return (mcTELEX_TONE[m] && mcTELEX_TONE[m][c]) || c;
    }
}

function share() {
  navigator.clipboard.writeText($id("txtPadout").innerHTML.replace(/ <br> /g, "\n"));
}