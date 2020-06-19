"use strict";

class Translator {
    constructor(){
        this._options = Object.assign({}, this.defaultConfig, options);        
        this._lang = this.getLanguage();
        this._elements = document.querySelectorAll("[data-i18n]");
    }


    getLanguage(){
        let lang = navigator.languages ? navigator.languages[0] : navigator.language.substr(0,2);
        return lang;
    }

    load(lang = null) {
        if(lang){
            if(!this._options.languages.includes(lang)) {
                return;
            }

            this._lang = lang;
        }

    var path = `${this._options.filesLocation}/${this._lang}.json`;

    fetch(path)
        .then((response) => response.json())
        .then((translation) => {
            this.translate(translation);
            this.toggleLangTag();

            if(this._options.persist){
                localStorage.setItem("language", this._lang);
            }
        })
        .catch(() => {
        console.error(`Could not load ${this._lang}.json.`);
        });
    
    }


    translate(translation) {
        this._elements.forEach((element) => {
            let keys = element.dataset.i18n.split(".");
            let text = keys.reduce((obj, i) => object[i], translation);

            if(text) {
                while(element.firstChild){
                    element.removeChild(element.firstChild);
                    element.appendChild(document.createTextNode(text));
                }
            }

            // if(this._lang == "ja"){
            //     document.getElementById("pdf").setAttribute("href", "documents/Scarani_Jacob_CV_JP")
            // }
        });
    }

    toggleLangTag() {
        if (document.documentElement.lang !== this._lang) {
          document.documentElement.lang = this._lang;
        }
      }

}

export default Translator;

var translator = new Translator();