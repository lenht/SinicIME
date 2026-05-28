var curtxtPadlength = 0;



// Mobile keydown
function txtPadKeyDown(evt) {

}

// Mobile input
function txtPadKeyInput(evt) {

    var evtK = evt.keyCode || evt.charCode;
    var rubystr = $("#rubytype").text();

    var curcaret = $("#txtPad")[0].selectionEnd;

    var newtxtPadlength =
        document.getElementById("txtPad").value.length;

    // Max composition length
    if ([...rubystr].length >= 12) {

        contail = "";
        conqueue = "";
        conlenbuf = 0;

        delList();

        $("#rubytype").html("");

        lentype = 0;

        return;
    }

    // BACKSPACE
    if (newtxtPadlength < curtxtPadlength) {

        if (curtxtPadlength - newtxtPadlength > 1) {

            $("#rubytype").html("");

            listUpdate();

            lentype = 0;

            curtxtPadlength =
                document.getElementById("txtPad").value.length;

            return;
        }

        if (rubystr.length > 0) {

            $("#rubytype").html(
                rubystr.substring(0, rubystr.length - 1)
            );

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

            $("#rubytype").html("");

            listUpdate();

            lentype = 0;

            curtxtPadlength =
                document.getElementById("txtPad").value.length;

            return;
        }

        var ind = selectedindex - 1;

        // SPACE
        if (evtC == ' ') {

            $("#txtPad").val(
                $("#txtPad").val().substring(0, curcaret - 1) +
                $("#txtPad").val().substring(
                    curcaret,
                    $("#txtPad").val().length
                )
            );

            $("#txtPad")[0].selectionStart =
            $("#txtPad")[0].selectionEnd =
                curcaret - 1;

            if (optionlist.length != 0) {

                evt.preventDefault();

                conlentmp =
                    $("#w" + selectedindex).text().length;

                putWord(
                    $("#w" + selectedindex).text()
                );
            }

            curtxtPadlength =
                document.getElementById("txtPad").value.length;

            $("#txtPad").focus();

            return;
        }

        // Punctuation
        else if (
            (evtC == '.') ||
            (evtC == ',')
        ) {

            $("#txtPad").val(
                $("#txtPad").val().substring(0, curcaret - 1) +
                evtC +
                $("#txtPad").val().substring(
                    curcaret,
                    $("#txtPad").val().length
                )
            );

            $("#txtPad")[0].selectionStart =
            $("#txtPad")[0].selectionEnd =
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
                    $("#w" + selectedindex).text()
                );
            }

            conqueue = "";
            contail = "";
            conlenbuf = 0;

            lentype = 0;

            $("#txtPad")[0].selectionStart =
            $("#txtPad")[0].selectionEnd =
                $("#txtPad")[0].selectionEnd + 1;

            lentype++;

            $("#rubytype").html(
                typeChar($("#rubytype").text(), evtC)
            );
        }

        // Normal character
        else if (evtK != 8) {

            lentype++;

            $("#rubytype").html(
                typeChar($("#rubytype").text(), evtC)
            );
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
        carpos = $('#txtPad')[0].selectionEnd;

    return;
}

function leftopt() {

    if (bPgup) {

        upPage();

        setSelectedIndex(1);
    }

    if (carpos == -1)
        carpos = $('#txtPad')[0].selectionEnd;

    return;
}
