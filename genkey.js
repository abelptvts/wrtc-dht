const ed = require("bittorrent-dht-sodium");

const keyPair = ed.keygen();
console.log({
    pk: keyPair.pk.toString("hex"),
    sk: keyPair.sk.toString("hex"),
});
