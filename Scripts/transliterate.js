var ipaSQL = [];
var ipadb;

// Connect to sqlite db file
var xhr = new XMLHttpRequest();
xhr.open('GET', './Resources/ipa.jpg', true);
xhr.responseType = 'arraybuffer';
xhr.onload = function (e) {
    var uInt8Array = new Uint8Array(this.response);
    ipadb = new SQL.Database(uInt8Array);
};
xhr.send();


function VietIPA(w, accent) {
    var ipa = {};
    ipa.onset = "", ipa.rime = "", ipa.tone = "";
    for (var i = 0; i < w.length; i++) {
        var c = w.charAt(i);
        if ("qrtpsdđfghjklzxcvbnm".includes(c)) {
            ipa.onset += c;
        }
        else {
            if (ipa.onset == "q") {
                ipa.onset = "qu";
                ipa.rime = w.substring(i + 1);
            } else if ((ipa.onset == "g") && (i == 1) && "iìíỉĩịyỳýỷỹỵ".includes(c)) {
                ipa.onset = "gi";
                ipa.rime = w.substring(i);
            } else {
                ipa.rime = w.substring(i);
            }
            break;
        }
    }

    for (var i = 0; i < ipa.rime.length; i++) {
        var c = ipa.rime.charAt(i);
        var c_plain = "";
        switch (c) {
            case 'á': ipa.tone = "́"; c_plain = 'a'; break; case 'à': ipa.tone = "̀"; c_plain = 'a'; break; case 'ả': ipa.tone = "̉"; c_plain = 'a'; break; case 'ã': ipa.tone = "̃"; c_plain = 'a'; break; case 'ạ': ipa.tone = "̣"; c_plain = 'a'; break;
            case 'ấ': ipa.tone = "́"; c_plain = 'â'; break; case 'ầ': ipa.tone = "̀"; c_plain = 'â'; break; case 'ẩ': ipa.tone = "̉"; c_plain = 'â'; break; case 'ẫ': ipa.tone = "̃"; c_plain = 'â'; break; case 'ậ': ipa.tone = "̣"; c_plain = 'â'; break;
            case 'ắ': ipa.tone = "́"; c_plain = 'ă'; break; case 'ằ': ipa.tone = "̀"; c_plain = 'ă'; break; case 'ẳ': ipa.tone = "̉"; c_plain = 'ă'; break; case 'ẵ': ipa.tone = "̃"; c_plain = 'ă'; break; case 'ặ': ipa.tone = "̣"; c_plain = 'ă'; break;
            case 'é': ipa.tone = "́"; c_plain = 'e'; break; case 'è': ipa.tone = "̀"; c_plain = 'e'; break; case 'ẻ': ipa.tone = "̉"; c_plain = 'e'; break; case 'ẽ': ipa.tone = "̃"; c_plain = 'e'; break; case 'ẹ': ipa.tone = "̣"; c_plain = 'e'; break;
            case 'ế': ipa.tone = "́"; c_plain = 'ê'; break; case 'ề': ipa.tone = "̀"; c_plain = 'ê'; break; case 'ể': ipa.tone = "̉"; c_plain = 'ê'; break; case 'ễ': ipa.tone = "̃"; c_plain = 'ê'; break; case 'ệ': ipa.tone = "̣"; c_plain = 'ê'; break;
            case 'í': ipa.tone = "́"; c_plain = 'i'; break; case 'ì': ipa.tone = "̀"; c_plain = 'i'; break; case 'ỉ': ipa.tone = "̉"; c_plain = 'i'; break; case 'ĩ': ipa.tone = "̃"; c_plain = 'i'; break; case 'ị': ipa.tone = "̣"; c_plain = 'i'; break;
            case 'ó': ipa.tone = "́"; c_plain = 'o'; break; case 'ò': ipa.tone = "̀"; c_plain = 'o'; break; case 'ỏ': ipa.tone = "̉"; c_plain = 'o'; break; case 'õ': ipa.tone = "̃"; c_plain = 'o'; break; case 'ọ': ipa.tone = "̣"; c_plain = 'o'; break;
            case 'ố': ipa.tone = "́"; c_plain = 'ô'; break; case 'ồ': ipa.tone = "̀"; c_plain = 'ô'; break; case 'ổ': ipa.tone = "̉"; c_plain = 'ô'; break; case 'ỗ': ipa.tone = "̃"; c_plain = 'ô'; break; case 'ộ': ipa.tone = "̣"; c_plain = 'ô'; break;
            case 'ớ': ipa.tone = "́"; c_plain = 'ơ'; break; case 'ờ': ipa.tone = "̀"; c_plain = 'ơ'; break; case 'ở': ipa.tone = "̉"; c_plain = 'ơ'; break; case 'ỡ': ipa.tone = "̃"; c_plain = 'ơ'; break; case 'ợ': ipa.tone = "̣"; c_plain = 'ơ'; break;
            case 'ú': ipa.tone = "́"; c_plain = 'u'; break; case 'ù': ipa.tone = "̀"; c_plain = 'u'; break; case 'ủ': ipa.tone = "̉"; c_plain = 'u'; break; case 'ũ': ipa.tone = "̃"; c_plain = 'u'; break; case 'ụ': ipa.tone = "̣"; c_plain = 'u'; break;
            case 'ứ': ipa.tone = "́"; c_plain = 'ư'; break; case 'ừ': ipa.tone = "̀"; c_plain = 'ư'; break; case 'ử': ipa.tone = "̉"; c_plain = 'ư'; break; case 'ữ': ipa.tone = "̃"; c_plain = 'ư'; break; case 'ự': ipa.tone = "̣"; c_plain = 'ư'; break;
            case 'ý': ipa.tone = "́"; c_plain = 'y'; break; case 'ỳ': ipa.tone = "̀"; c_plain = 'y'; break; case 'ỷ': ipa.tone = "̉"; c_plain = 'y'; break; case 'ỹ': ipa.tone = "̃"; c_plain = 'y'; break; case 'ỵ': ipa.tone = "̣"; c_plain = 'y'; break;
            default: c_plain = c; break;
        }
        if (c_plain != c) {
            ipa.rime = ipa.rime.substr(0, i) + c_plain + ipa.rime.substr(i + 1);
            break;
        }
    }
    var deadcons = ipa.rime.slice(ipa.rime.length - 1)
    if ("pct".includes(deadcons) || (ipa.rime.slice(ipa.rime.length - 2) == "ch"))
        ipa.tone += "ˀ";

    if (ipa.tone == "") {
        ipa.tone = "ʔ";
    }
    if (ipa.onset == "") {
        ipa.onset = "∅";
    }
    if ((ipa.onset == "qu") && (ipa.rime == "ôc")) {
        ipa.onset = "q";
        ipa.rime = "uâc";
    }
    if (((ipa.onset == "kh") || (ipa.onset == "g") || (ipa.onset == "ng") || (ipa.onset == "h")) && (ipa.rime.startsWith("oa") || ipa.rime.startsWith("oă") || ipa.rime.startsWith("oe") || ipa.rime.startsWith("uâ") || ipa.rime.startsWith("uê") || ipa.rime.startsWith("uy") || ipa.rime.startsWith("uơ"))) {
        ipa.onset += "w";
    }
    if ((ipa.onset == "gi") && !['i', 'in', 'it', 'inh', 'ich', 'im', 'ip', 'iên', 'iêt', 'iêng', 'iêc', 'iêm', 'iêp', 'ya'].includes(ipa.rime)) {
        ipa.rime = ipa.rime.substring(1);
    }

    ipaSQL = ipadb.exec("SELECT " + accent + " FROM Viet where phone='" + ipa.onset + "' ");
    if (ipaSQL.length > 0)
        ipa.onset = ipaSQL[0].values[0];
    else
        return { onset: "", rime: "∅", tone: "" };
    ipaSQL = ipadb.exec("SELECT " + accent + " FROM Viet where phone='" + ipa.rime + "' ");
    if (ipaSQL.length > 0)
        ipa.rime = ipaSQL[0].values[0];
    else
        return { onset: "", rime: "∅", tone: "" };
    ipaSQL = ipadb.exec("SELECT " + accent + " FROM Viet where phone='" + ipa.tone + "' ");
    if (ipaSQL.length > 0)
        ipa.tone = ipaSQL[0].values[0];
    else
        return {onset: "", rime: "∅", tone: ""};

    return (ipa);
}