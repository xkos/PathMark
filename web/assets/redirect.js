const language = (navigator.language || "en").toLowerCase();
location.replace(language.startsWith("zh") ? "/zh-CN/" : "/en/");
