var curtxtPadlength = 0;



// Mobile keydown
function txtPadKeyDown(evt) {

}

// Mobile input
function txtPadKeyInput(evt) {

    var evtK = evt.keyCode || evt.charCode;
    var txtPadEl = document.getElementById("txtPad");
    var rubytypeEl = document.getElementById("rubytype");
    var rubystr = rubytypeEl.textContent;

    var curcaret = txtPadEl.selectionEnd;

    var newtxtPadlength =
        document.getElementById("txtPad").value.length;

    // Max composition length
    if ([...rubystr].length >= 12) {

        contail = "";
        conqueue = "";
        conlenbuf = 0;

        delList();

        rubytypeEl.innerHTML = "";

        lentype = 0;

        return;
    }

    // BACKSPACE
    if (newtxtPadlength < curtxtPadlength) {

        if (curtxtPadlength - newtxtPadlength > 1) {

            rubytypeEl.innerHTML = "";

            listUpdate();

            lentype = 0;

            curtxtPadlength =
                document.getElementById("txtPad").value.length;

            return;
        }

        if (rubystr.length > 0) {

            rubytypeEl.innerHTML =
                rubystr.substring(0, rubystr.length - 1);

            lentype--;

        } else {

            lentype = 0;
        }

        listUpdate();

        curtxtPadlength =
            document.getElementById("txtPad").value.length;

        return;
    }

    // CHARACTER INPUT
    if (newtxtPadlength > curtxtPadlength) {

        var evtC =
            document.getElementById("txtPad")
            .value.substring(curcaret - 1, curcaret);

        // ENTER
        if (evtK == 13) {

            rubytypeEl.innerHTML = "";

            listUpdate();

            lentype = 0;

            curtxtPadlength =
                document.getElementById("txtPad").value.length;

            return;
        }

        var ind = selectedindex - 1;

        // SPACE
        if (evtC == ' ') {

            txtPadEl.value =
                txtPadEl.value.substring(0, curcaret - 1) +
                txtPadEl.value.substring(
                    curcaret,
                    txtPadEl.value.length
                );

            txtPadEl.selectionStart =
            txtPadEl.selectionEnd =
                curcaret - 1;

            if (optionlist.length != 0) {

                evt.preventDefault();

                var wordEl = document.getElementById("w" + selectedindex);

                conlentmp =
                    wordEl.textContent.length;

                putWord(
                    wordEl.textContent
                );
            }

            curtxtPadlength =
                document.getElementById("txtPad").value.length;

            txtPadEl.focus();

            return;
        }

        // Punctuation
        else if (
            (evtC == '.') ||
            (evtC == ',')
        ) {

            txtPadEl.value =
                txtPadEl.value.substring(0, curcaret - 1) +
                evtC +
                txtPadEl.value.substring(
                    curcaret,
                    txtPadEl.value.length
                );

            txtPadEl.selectionStart =
            txtPadEl.selectionEnd =
                curcaret - 1;

            if (
                (ind >= conrSz) &&
                (ind < contrSz)
            )
                conlenbuf = conlentail;

            if (ind >= contrSz)
                conlenbuf = 0;

            if (optionlist.length != 0) {

                putWord(
                    document.getElementById("w" + selectedindex).textContent
                );
            }

            conqueue = "";
            contail = "";
            conlenbuf = 0;

            lentype = 0;

            txtPadEl.selectionStart =
            txtPadEl.selectionEnd =
                txtPadEl.selectionEnd + 1;

            lentype++;

            rubytypeEl.innerHTML =
                typeChar(rubytypeEl.textContent, evtC);
        }

        // Normal character
        else if (evtK != 8) {

            lentype++;

            rubytypeEl.innerHTML =
                typeChar(rubytypeEl.textContent, evtC);
        }

        listUpdate();

        curtxtPadlength =
            document.getElementById("txtPad").value.length;

        return;
    }
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
