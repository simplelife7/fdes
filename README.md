fdes
====

FDES以书签栏嵌入脚本的形式，提供一些优质的前端资源索引

支持[FDES](javascript:;function includeScriprt(url,fnback){var script=document.createElement("script");script.type="text/javascript";script.charset="UTF-8";script.src=url+"?t="+parseInt(new Date().getTime());document.getElementsByTagName("body")[0].appendChild(script);function done(){fnback()}script.onload=script.onreadystatechange=function(){console.log(script.readyState);script.readyState?script.readyState.toLowerCase()=="loaded"&&done():done()}}function includeStyle(url){var style=document.createElement("link");style.type="text/css";style.rel="stylesheet";style.href=url+"?t="+parseInt(new Date().getTime());document.getElementsByTagName("head")[0].appendChild(style)}if(window.jQuery){(function($){$.getScript("https://raw2.github.com/simplelife7/fdes/master/main.js",function(){includeStyle("http://127.0.0.1/qs/style.css");FDES.init($)})})(jQuery)}else{includeScriprt("http://libs.baidu.com/jquery/1.9.1/jquery.min.js",function(){$.getScript("https://raw2.github.com/simplelife7/fdes/master/main.js",function(data){includeStyle("http://127.0.0.1/qs/style.css");FDES.init($)})})};return false;)