
module.exports = {
    getCloudToken: function(apiKey){
        if (!apiKey) return "";
        const k = apiKey.split("-").pop();
        
        let store = {};
        try{
            store = JSON.parse(window.localStorage.getItem("lightning_cloud_tokens") || "{}");
        }catch(e){}

        return store[k] || "";
    },

    setCloudToken: function(apiKey, token){
        if (!apiKey) return false;
        const k = apiKey.split("-").pop();

        let store = {};
        try{
            store = JSON.parse(window.localStorage.getItem("lightning_cloud_tokens") || "{}");
        }catch(e){}

        store[k] = token;
        window.localStorage.setItem("lightning_cloud_tokens", JSON.stringify(store));
    }
}