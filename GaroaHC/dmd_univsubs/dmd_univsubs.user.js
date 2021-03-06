// ==UserScript==
// @name           DMD subtitles
// @namespace      subtitles in a dot matrix display
// @include        http://universalsubtitles.org/en/videos/*
// ==/UserScript==


(function (){

var counter=0;
var dmd;
function send_dmd_text(text){
  dmd.innerHTML=text;
  counter++;
  setTimeout(function() {
  GM_xmlhttpRequest({
    method: 'GET',
    url: 'http://localhost:8080/?'+text+'&'+counter,
  });
 }, 0);
}

function widgetChanged(w){
  var div = document.getElementsByClassName("mirosubs-captionDiv")[0];
  if (div){
    send_dmd_text(div.textContent);
  }
}

function do_it_later(){
  var widget = document.getElementsByClassName("mirosubs-widget")[0];
  widget.addEventListener("DOMSubtreeModified", widgetChanged, false);
  dmd = document.getElementsByClassName("title-container")[0];
}

window.setTimeout(do_it_later, 1000);

})();
