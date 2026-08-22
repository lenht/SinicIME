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

var shiftbool = false;
var kblist = ["E→文", "E→P", "P→文"];
var keyboard = 0;
var contents = [];
var condb;
var conlenbuf = 0;
var conlentmp = 0;
var conlentail = 0;
var concSz = 0;
var conqSz = 0;
var conrSz = 0;
var contcSz = 0;
var contqSz = 0;
var contrSz = 0;
var contail = "";
var conqueue = "";
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

    $css(document.getElementById("waitscreen"), { display: "none" });
    document.getElementById("txtPad").focus();
};

xhr.onerror = function () {
    console.error("Failed to load imenom.jpg");
    $css(document.getElementById("waitscreen"), { display: "none" });
};

xhr.send();

// Escapes single quotes for inclusion in a SQL string literal (SQLite-style:
// doubling the quote rather than backslash-escaping it).
function sqlEscape(str) {
    return str.replace(/\'/g, "''");
}

function optkeyboard(kbsel) {
    keyboard = kbsel;
    document.getElementById("kbname").innerHTML = kblist[kbsel];
    document.getElementById("txtPad").focus();
}

//keydown
// Clears the in-progress composition (rubytype buffer, candidate queue, and
// candidate list). Shared by the CTRL/ESC handler, the arrow-key-with-no-
// candidates handler, and the touch-input max-length handler.
function resetComposition() {
    contail = conqueue = "";
    conlenbuf = 0;
    delList();
    document.getElementById("rubytype").innerHTML = "";
    lentype = 0;
}

function txtPadKeyPressed(evt) {
    var evtK = evt.keyCode || evt.charCode;
    var txtPadEl = document.getElementById("txtPad");
    var rubytypeEl = document.getElementById("rubytype");
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
                selExample(document.getElementById("w" + ind).textContent, rubytypeEl.textContent);
                return;
            }
            var selstart = txtPadEl.selectionStart;
            var selend = txtPadEl.selectionEnd;
            var subtxt = txtPadEl.value.substring(selstart, selend);
            if (subtxt.length > 0)
                document.getElementById("example").innerHTML = "<table><tr><td>" + logo2phon(subtxt, 20) + "</td></tr></table>";
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
    var txtPadEl = document.getElementById("txtPad");
    var rubytypeEl = document.getElementById("rubytype");
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
        conqueue = contail = "";
        if (selnum == 0) {
            putWord(rubystr);
            return;
        }
        if (optionlist.length >= selnum) {
            if ((selnum > conrSz) && (selnum <= contrSz))
                conlenbuf = conlentail;
            if (selnum > contrSz)
                conlenbuf = 0;
            putWord(document.getElementById("w" + selnum).textContent);
        } else {
            var txtarea = txtPadEl.value;
            var caretend = txtPadEl.selectionEnd;
            txtPadEl.value = txtarea.substring(0, caretend) + evtC + txtarea.substring(caretend, txtarea.length);
            txtPadEl.selectionStart = txtPadEl.selectionEnd = caretend + evtC.length;
            rubytypeEl.innerHTML = "";
            lentype = 0;
            delList();
        }
        conqueue = contail = "";
        conlenbuf = 0;
        return;
    } else if (evtK == 32) {    //SPACE
        if (optionlist.length == 1) {
            rubytypeEl.innerHTML = rubystr + " ";
            listUpdate();
        }
        if (ind < concSz) {
            if (concSz == conqSz)
                conqueue = "";
            else
                conqueue = conqueue + rubystr + " ";
            contail = "";
        } else if (ind < conqSz) {
            conqueue = conqueue + rubystr + " ";
            contail = rubystr + " ";
        } else if (ind < conrSz)
            conqueue = contail = "";
        else if (ind < contcSz) {
            conlenbuf = conlentail;
            if (contcSz == contqSz)
                conqueue = "";
            else
                conqueue = contail + rubystr + " ";
            contail = "";
        } else if (ind < contqSz) {
            conlenbuf = conlentail;
            conqueue = contail + rubystr + " ";
            contail = rubystr + " ";
        } else if (ind < contrSz) {
            conlenbuf = conlentail;
            conqueue = contail = "";
        } else {
            conqueue = rubystr + " ";
            contail = "";
            conlenbuf = 0;
        }
        if (optionlist.length != 0) {
            evt.preventDefault();
            conlentmp = document.getElementById("w" + selectedindex).textContent.length;
            putWord(document.getElementById("w" + selectedindex).textContent);
        }
        txtPadEl.focus();
        return;
    } else if (((evtK > 31) && (evtK < 39)) || ((evtK > 39) && (evtK < 48)) || ((evtK > 57) && (evtK < 65)) || ((evtK > 90) && (evtK < 96)) || ((evtK > 122) && (evtK < 127))) {    //Punctuation
        if ((ind >= conrSz) && (ind < contrSz))
            conlenbuf = conlentail;
        if (ind >= contrSz)
            conlenbuf = 0;
        if (optionlist.length != 0) {
            putWord(document.getElementById("w" + selectedindex).textContent);
        }
        conqueue = contail = "";
        conlenbuf = 0;
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
    document.getElementById("example").innerHTML = "<table><tr><td>"+document.getElementById("DictGuide").value+"</td></tr></table>";
    if (carpos != -1) {
        document.getElementById('txtPad').selectionStart = carpos;
        document.getElementById('txtPad').selectionEnd = carpos;
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
        carpos = document.getElementById('txtPad').selectionEnd;
    return;
}

function leftopt() {
    if (bPgup) {
        upPage();
        setSelectedIndex(1);
    }
    if (carpos == -1)
        carpos = document.getElementById('txtPad').selectionEnd;
    return;
}

// Touch-input handler: mobile/touch keyboards don't reliably report keyCode on
// keydown/keypress, so composition here is inferred by diffing txtPad's value
// on 'keyup' instead of reading key events directly (contrast with
// txtPadKeyPressed/txtPadKeyTyped, which handle the same job for physical
// keyboards). Wired up conditionally in index.html based on touch support.
function txtPadKeyInput(evt) {
    var evtK = evt.keyCode || evt.charCode;
    var txtPadEl = document.getElementById("txtPad");
    var rubytypeEl = document.getElementById("rubytype");
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
            if (optionlist.length != 0) {
                evt.preventDefault();
                var wordEl = document.getElementById("w" + selectedindex);
                conlentmp = wordEl.textContent.length;
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
            if ((ind >= conrSz) && (ind < contrSz))
                conlenbuf = conlentail;
            if (ind >= contrSz)
                conlenbuf = 0;
            if (optionlist.length != 0) {
                putWord(document.getElementById("w" + selectedindex).textContent);
            }
            conqueue = "";
            contail = "";
            conlenbuf = 0;
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
    var txtPadEl = document.getElementById("txtPad");
    var txtarea = txtPadEl.value;
    txtPadEl.selectionStart = txtPadEl.selectionEnd - lentype - conlenbuf;
    var caretbeg = txtPadEl.selectionStart;
    var caretend = txtPadEl.selectionEnd;
    txtPadEl.value = txtarea.substring(0, caretbeg) + instr + txtarea.substring(caretend, txtarea.length);
    conlenbuf = 0;
    txtPadEl.selectionStart = txtPadEl.selectionEnd = caretbeg + instr.length;
    document.getElementById("rubytype").innerHTML = "";
    lentype = 0;
    delList();
}

function upPage() {
    pgEn = pgBe;
    pgBe -= 9;
    conqSz += 9;
    concSz += 9;
    conrSz += 9;
    contqSz += 9;
    contcSz += 9;
    contrSz += 9;
    bPgdn = true;
    if (pgBe == 0) {
        bPgup = false;
        bPgdn = true;
    }
    var optionsublist = optionlist.slice(pgBe, pgEn);
    var i;
    for (i = 1; i <= 9; i++) {
        document.getElementById("w" + i).innerHTML = optionsublist[i - 1];
    }
}

function dnPage() {
    pgBe += 9;
    conqSz -= 9;
    concSz -= 9;
    conrSz -= 9;
    contqSz -= 9;
    contcSz -= 9;
    contrSz -= 9;
    bPgup = true;
    var optionsublist;
    var i;
    if (optionlist.length > (9 + pgBe)) {
        pgEn = pgBe + 9;
        optionsublist = optionlist.slice(pgBe, pgEn);
        for (i = 1; i <= 9; i++) {
            document.getElementById("w" + i).innerHTML = optionsublist[i - 1];
        }
    } else {
        pgEn = optionlist.length;
        bPgdn = false;
        optionsublist = optionlist.slice(pgBe, pgEn);
        var listsize = pgEn - pgBe;
        whitelist();
        for (i = 1; i <= listsize; i++) {
            document.getElementById("w" + i).innerHTML = optionsublist[i - 1];
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
        contents = condb.exec("select word, ruby from " + opttable + " where " + optruby + " like '" + sqlEscape(ruby).toLowerCase() + "%' and " + optruby + "!='" + ruby + "' " + optlev + "");
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
    if ((conqueue == "") || (keyboard == 1))
        return;
    var optta = opttable;
    var cruby = conqueue + ruby;
    var csize = cruby.split(" ").length;
    var rawcubo = [];

    var r = compoundLookup("c" + optta, "cword", sqlEscape(cruby), csize, " ", ":", "", rawcubo);
    rawcubo = r.pcubo;
    concSz = r.excSz;
    conqSz = r.excSz + (r.prefixFound ? 1 : 0);
    conrSz = r.prefixFound ? r.finalSz : r.excSz;
    if ((r.excSz > 0) || r.prefixFound)
        conlenbuf = conlentmp;
    if (r.prefixFound)
        conlentail = rawcubo[r.excSz][csize - 1].length;

    if (contail != "") {
        var truby = contail + ruby;
        var tsize = truby.split(" ").length;
        var r2 = compoundLookup("c" + optta, "cword", sqlEscape(truby), tsize, " ", ":", "", rawcubo);
        rawcubo = r2.pcubo;
        if ((r2.excSz > 0) || r2.prefixFound)
            conlenbuf = conlentmp;
        if (r2.prefixFound) {
            contqSz++;
            contrSz = r2.finalSz;
            conlentail = rawcubo[r2.excSz][tsize - 1].length;
        }
    }

    var cubo = rawcubo.map(function (arr) { return arr.join(""); });
    optionlist = optionlist.concat(cubo);
}

function convertpad(direction, maxlevel) {
    var convtxt = "";
    var txtPadEl = document.getElementById("txtPad");
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
        var txtPadoutEl = document.getElementById("txtPadout");
        $css(txtPadEl, { 'width': '50%' });
        $css(txtPadoutEl, { 'writing-mode': 'horizontal-tb' });
        $css(txtPadoutEl, { 'display': 'block' });
        txtPadoutEl.innerHTML = convtxt.replace(/\n/g, " <br> ");
		$css(document.getElementById("copy_button"), { 'display': 'block' });
    } else {
        offpad();
    }
}


function focuspad() {
    if (document.getElementById("txtPadout").innerHTML == "") {
        offpad();
    }
}

function offpad() {
        $css(document.getElementById("txtPadout"), { 'display': 'none' });
        $css(document.getElementById("txtPadout"), { 'writing-mode': 'horizontal-tb' });
		$css(document.getElementById("copy_button"), { 'display': 'none' });
        $css(document.getElementById("txtPad"), { 'width': '100%' });
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
//   key                : match key, already escaped by the caller if needed
//                        (selPhone passes it raw; selChar passes sqlEscape(key))
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

    contents = condb.exec("SELECT " + selectCol + ", " + matchCol + " FROM cmpnom WHERE " + matchCol + " like '" + key + matchDelim + "%'" + extraGuard);
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

function selPhone(phrase, maxlevel, defa){
    var ext = !defa;
    if ((phrase.length == 1) && defa)
        ext = true;
    var outputarr = [];
    var sss = "";
    var word = phrase;
    var k;
    var sql = "";
    var fullchar;

    var pconcSz = 0;
    var pconqSz = 0;
    var pconrSz = 0;
    var pcontcSz = 0;
    var pcontqSz = 0;
    var pcontrSz = 0;
    var pcontail = "";
    var pconqueue = "";
    var pcubo = [];

    for (k = 0; k != word.length; k++) {
        pconqSz = pconrSz = pconcSz = pcontqSz = pcontrSz = pcontcSz = 0;
        if ((word[k].charCodeAt(0) < 0xD800) || (word[k].charCodeAt(0) >= 0xE000)) {
            fullchar = word[k];
        } else {
            fullchar = word[k] + word[k + 1];
            //sql = "select "+optruby+" from "+opttable+" where HEX(word)='"+SuppChar.asHex(word2)+"' order by level desc";
            if ((phrase.length == 2) && !ext)
                ext = true;
            k++;
        }

        pcubo = [];
        if (pconqueue != "") {
            var optta = opttable;
            var guard = " AND c" + optta + " <> '' AND c" + optta + " IS NOT NULL";
            var cfullchar = pconqueue + fullchar;
            var csize = cfullchar.split(":").length;
            var r = compoundLookup("cword", "c" + optta, cfullchar, csize, ":", " ", guard, pcubo);
            pcubo = r.pcubo;
            pconcSz = r.excSz;
            pconqSz = r.excSz + (r.prefixFound ? 1 : 0);
            pconrSz = r.prefixFound ? r.finalSz : r.excSz;

            if (pcontail != "") {
                var truby = pcontail + fullchar;
                var tsize = truby.split(":").length;
                var r2 = compoundLookup("cword", "c" + optta, truby, tsize, ":", " ", guard, pcubo);
                pcubo = r2.pcubo;
                if (r2.prefixFound) {
                    pcontqSz++;
                    pcontrSz = r2.finalSz;
                }
            }
        }
        var q;

        sql = "select " + optruby + ", (level % " + maxlevel + ") from " + opttable + " where word='" + fullchar + "' order by (level % " + maxlevel + ") desc";
        contents = condb.exec(sql);
        if (contents.length != 0) {
            sss = contents[0].values[0][0];
            if (ext) {
                for (q = 1; q < contents[0].values.length; q++) {
                    sss = sss + "/" + contents[0].values[q][0];
                }
            }
        }

        if (pconcSz > 0) {
            if (pconcSz == pconqSz)
                pconqueue = "";
            else
                pconqueue = pconqueue + fullchar + ":";
            pcontail = "";
        } else if (pconqSz > 0) {
            pconqueue = pconqueue + fullchar + ":";
            pcontail = fullchar + ":";
        } else if (pconrSz > 0) {
            pconqueue = pcontail = "";
        } else if (pcontcSz > 0) {
            if (pcontcSz == pcontqSz)
                pconqueue = "";
            else
                pconqueue = pcontail + fullchar + ":";
            pcontail = "";
        } else if (pcontqSz > 0) {
            pconqueue = pcontail + fullchar + ":";
            pcontail = fullchar + ":";
        } else if (pcontrSz > 0) {
            pconqueue = pcontail = "";
        } else {
            pconqueue = fullchar + ":";
            pcontail = "";
            pcubo = [];
        }

        if (pcubo.length != 0) {
            for (q = 1; q < pcubo[0].length; q++) {
                outputarr.pop();
            }
            for (q = 0; q != pcubo[0].length; q++) {
                outputarr.push(pcubo[0][q]);
            }
        } else {
            if (sss.length > 0)
                outputarr.push(sss);
            else
                outputarr.push("$" + fullchar);
        }
        sss = "";
    }

    return outputarr;
}

function selChar(phrase, maxlevel, defa) {
    var ext = !defa;
    if ((phrase.length == 1) && defa)
        ext = true;
    var outputarr = [];
    var sss = "";
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
    var sql = "";
    var fullcharcase;
    var fullchar;

    var pconcSz = 0;
    var pconqSz = 0;
    var pconrSz = 0;
    var pcontcSz = 0;
    var pcontqSz = 0;
    var pcontrSz = 0;
    var pcontail = "";
    var pconqueue = "";
    var pcubo = [];

    for (k = 0; k != word.length; k++) {
        pconqSz = pconrSz = pconcSz = pcontqSz = pcontrSz = pcontcSz = 0;

        fullcharcase = word[k];

        fullchar = fullcharcase.toLowerCase();

        pcubo = [];
        if (pconqueue != "") {
            var optta = opttable;
            var cfullchar = pconqueue + fullchar;
            var csize = cfullchar.split(" ").length;
            var r = compoundLookup("c" + optta, "cword", sqlEscape(cfullchar), csize, " ", ":", "", pcubo);
            pcubo = r.pcubo;
            pconcSz = r.excSz;
            pconqSz = r.excSz + (r.prefixFound ? 1 : 0);
            pconrSz = r.prefixFound ? r.finalSz : r.excSz;

            if (pcontail != "") {
                var truby = pcontail + fullchar;
                var tsize = truby.split(" ").length;
                var r2 = compoundLookup("c" + optta, "cword", sqlEscape(truby), tsize, " ", ":", "", pcubo);
                pcubo = r2.pcubo;
                if (r2.prefixFound) {
                    pcontqSz++;
                    pcontrSz = r2.finalSz;
                }
            }
        }
        var q;

        sql = "select word,(level % " + maxlevel + ") from " + opttable + " where " + optruby + "='" + sqlEscape(fullchar) + "' order by (level % " + maxlevel + ") desc";
        contents = condb.exec(sql);
        if (contents.length != 0) {
            sss = contents[0].values[0][0];
            if (ext) {
                for (q = 1; q < contents[0].values.length; q++) {
                    sss = sss + "/" + contents[0].values[q][0];
                }
            }
        }

        if (pconcSz > 0) {
            if (pconcSz == pconqSz)
                pconqueue = "";
            else
                pconqueue = pconqueue + fullchar + " ";
            pcontail = "";
        } else if (pconqSz > 0) {
            pconqueue = pconqueue + fullchar + " ";
            pcontail = fullchar + " ";
        } else if (pconrSz > 0) {
            pconqueue = pcontail = "";
        } else if (pcontcSz > 0) {
            if (pcontcSz == pcontqSz)
                pconqueue = "";
            else
                pconqueue = pcontail + fullchar + " ";
            pcontail = "";
        } else if (pcontqSz > 0) {
            pconqueue = pcontail + fullchar + " ";
            pcontail = fullchar + " ";
        } else if (pcontrSz > 0) {
            pconqueue = pcontail = "";
        } else {
            pconqueue = fullchar + " ";
            pcontail = "";
            pcubo = [];
        }

        if (pcubo.length != 0) {
            for (q = 1; q < pcubo[0].length; q++) {
                outputarr.pop();
            }
            for (q = 0; q != pcubo[0].length; q++) {
                outputarr.push(pcubo[0][q]);
            }
        } else {
            if (sss.length > 0)
                outputarr.push(sss);
            else
                outputarr.push(fullcharcase);
        }
        sss = "";
    }

    return outputarr;
}

function selExample(word, ruby) {
    var cubo = [];
    var i;
    var cubostr = "<table>";
    contents = condb.exec("SELECT cword, c" + opttable + " FROM cmpnom WHERE c" + opttable + " LIKE '" + sqlEscape(ruby) + " %' OR c" + opttable + " LIKE '% " + sqlEscape(ruby) + "' OR c" + opttable + " LIKE '% " + sqlEscape(ruby) + " %'");
    if (contents.length != 0) {
        for (i = 0; i < contents[0].values.length; i++) {
            if (contents[0].values[i][0].indexOf(word) > -1) {
                cubostr += "<tr><td>" + contents[0].values[i][0].replace(/:/g, "") + "</td><td>" + contents[0].values[i][1] + "</td></tr>";
            }
        }
    }
    cubostr += "</table>";
    document.getElementById("example").innerHTML = cubostr;
    return;
}
function listUpdate() {
    var rubystr = document.getElementById("rubytype").textContent;
    delList();
    if (rubystr == "")
        return;

    addSelCompound(rubystr.toLowerCase());
    addSelRuby(rubystr.toLowerCase());
    if (optionlist.length > 9) {
        bPgdn = true;
        var i;
        for (i = 1; i <= 9; i++) {
            document.getElementById("w" + i).innerHTML = optionlist[i - 1];
        }
        setSelectedIndex(1);
    } else {
        var i;
        whitelist();
        for (i = 1; i <= optionlist.length; i++) {
            document.getElementById("w" + i).innerHTML = optionlist[i - 1];
        }
        setSelectedIndex(1);
    }

}

function delList() {
    optionlist = [];
    conqSz = conrSz = concSz = contqSz = contrSz = contcSz = 0;
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
        document.getElementById("w" + i).innerHTML = "";
    }
}

function setSelectedIndex(ind) {
    if (document.getElementById("w" + ind).textContent != "") {
        selectedindex = ind;
        clearHighlight();
        $css(document.getElementById("w" + ind), { 'background': '#eee', 'color': '#000' });
    }
    document.getElementById("txtPad").focus();
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

function TELEX(text, ch) {
    if (text.length == 0)
        return text + ch;
    var nc;
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
				nc = mcTELEX(a[l - 1], ch);
				if (nc=="")
					return a.substring(0, l - 1) + a.substring(l);
                if (a[l - 1] != nc) {
                    a = a.substring(0, l - 1) + nc + a.substring(l);
                    return a;
                }
                break;
        }
    }
    var i;
    for (i=l; i!=qu; i--) {
            nc = mcTELEX(a[i], ch);
			if (nc=="")
				return a.substring(0, i) + a.substring(i + 1);
            if (a[i]!=nc) {
                a = a.substring(0, i) + nc + a.substring(i + 1);
                if (oo) {
                    oo = false;
                    return (a + 'o');
                }
                return a;
            }
    }
    if (qu == 1) {
        nc = mcTELEX(a[1], ch);
		if (nc=="")
			return a.substring(0, 1) + a.substring(1 + 1);
        if (a[1] != nc) {
            a = a.substring(0, 1) + nc + a.substring(1 + 1);
            return a;
        }
    }
    return text + ch;
}

function mcTELEX(c, m) {
    switch (m) {
        case 'd':
            if (c == 'd') return 'đ';
            break;
        case 'a':
            if (c == 'a') return 'â';
            break;
        case 'e':
            if (c == 'e') return 'ê';
            break;
        case 'o':
            if (c == 'o') return 'ô';
            if (c == 'ô') { oo = true; return 'o'; }
            break;
        case 'w':
            if (c == 'a') return 'ă';
            if (c == 'o') return 'ơ';
            if (c == 'u') return 'ư';
            break;
        case 's':
            if (c == 'a') return 'á';
            if (c == 'e') return 'é';
            if (c == 'i') return 'í';
            if (c == 'o') return 'ó';
            if (c == 'u') return 'ú';
            if (c == 'â') return 'ấ';
            if (c == 'ă') return 'ắ';
            if (c == 'ô') return 'ố';
            if (c == 'ê') return 'ế';
            if (c == 'ư') return 'ứ';
            if (c == 'ơ') return 'ớ';
            if (c == 'y') return 'ý';
            break;
        case 'f':
            if (c == 'a') return 'à';
            if (c == 'e') return 'è';
            if (c == 'i') return 'ì';
            if (c == 'o') return 'ò';
            if (c == 'u') return 'ù';
            if (c == 'â') return 'ầ';
            if (c == 'ă') return 'ằ';
            if (c == 'ô') return 'ồ';
            if (c == 'ê') return 'ề';
            if (c == 'ư') return 'ừ';
            if (c == 'ơ') return 'ờ';
            if (c == 'y') return 'ỳ';
            break;
        case 'j':
            if (c == 'a') return 'ạ';
            if (c == 'e') return 'ẹ';
            if (c == 'i') return 'ị';
            if (c == 'o') return 'ọ';
            if (c == 'u') return 'ụ';
            if (c == 'â') return 'ậ';
            if (c == 'ă') return 'ặ';
            if (c == 'ô') return 'ộ';
            if (c == 'ê') return 'ệ';
            if (c == 'ư') return 'ự';
            if (c == 'ơ') return 'ợ';
            if (c == 'y') return 'ỵ';
            break;
        case 'x':
            if (c == 'a') return 'ã';
            if (c == 'e') return 'ẽ';
            if (c == 'i') return 'ĩ';
            if (c == 'o') return 'õ';
            if (c == 'u') return 'ũ';
            if (c == 'â') return 'ẫ';
            if (c == 'ă') return 'ẵ';
            if (c == 'ô') return 'ỗ';
            if (c == 'ê') return 'ễ';
            if (c == 'ư') return 'ữ';
            if (c == 'ơ') return 'ỡ';
            if (c == 'y') return 'ỹ';
            break;
        case 'r':
            if (c == 'a') return 'ả';
            if (c == 'e') return 'ẻ';
            if (c == 'i') return 'ỉ';
            if (c == 'o') return 'ỏ';
            if (c == 'u') return 'ủ';
            if (c == 'â') return 'ẩ';
            if (c == 'ă') return 'ẳ';
            if (c == 'ô') return 'ổ';
            if (c == 'ê') return 'ể';
            if (c == 'ư') return 'ử';
            if (c == 'ơ') return 'ở';
            if (c == 'y') return 'ỷ';
            break;
		case 'z':
            switch (c) {
                case 'á': case 'à': case 'ả': case 'ã': case 'ạ':
                    return 'a';
                case 'ấ': case 'ầ': case 'ẩ': case 'ẫ': case 'ậ':
                    return 'â';
                case 'ắ': case 'ằ': case 'ẳ': case 'ẵ': case 'ặ':
                    return 'ă';
                case 'é': case 'è': case 'ẻ': case 'ẽ': case 'ẹ':
                    return 'e';
                case 'ế': case 'ề': case 'ể': case 'ễ': case 'ệ':
                    return 'ê';
                case 'í': case 'ì': case 'ỉ': case 'ĩ': case 'ị':
                    return 'i';
                case 'ó': case 'ò': case 'ỏ': case 'õ': case 'ọ':
                    return 'o';
                case 'ố': case 'ồ': case 'ổ': case 'ỗ': case 'ộ':
                    return 'ô';
                case 'ớ': case 'ờ': case 'ở': case 'ỡ': case 'ợ':
                    return 'ơ';
                case 'ú': case 'ù': case 'ủ': case 'ũ': case 'ụ':
                    return 'u';
                case 'ứ': case 'ừ': case 'ử': case 'ữ': case 'ự':
                    return 'ư';
                case 'ý': case 'ỳ': case 'ỷ': case 'ỹ': case 'ỵ':
                    return 'y';
            }
            break;
    }
    return c;
}

function share() {
  navigator.clipboard.writeText(document.getElementById("txtPadout").innerHTML.replace(/ <br> /g, "\n"));
}