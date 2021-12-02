const { RTCPeerConnection, RTCIceCandidate } = require("wrtc");
const Signaling = require("./Signaling");
const cacheInvalidation = require("./cacheInvalidation");
const log = require("./log");

const keyPair = {
    pk: "0bf403b6d23e4429cef8285aa33db2e9663db569eab9f41a0f53f5711576d013",
    sk: "78a75f7d551486560ff7780cc832d8db2f149b05789b2f6d7f8776873dbe4eda0bf403b6d23e4429cef8285aa33db2e9663db569eab9f41a0f53f5711576d013",
};
const password = "b083846e8e3a42d1ab9452ef780f2c4d193aa861a0af709ce928cec409cb42d3";

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function main() {
    const connection = new RTCPeerConnection();
    const signaling = new Signaling(keyPair, password, cacheInvalidation);
    signaling.startListening();

    connection.onicecandidate = (event) => {
        if (event.candidate) {
            // log("sent ice candidate");
            signaling.sendICECandidate(event.candidate);
        }
    };

    signaling.on("icecandidate", (candidate) => {
        // log("got ice candidate");
        connection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    const channel = connection.createDataChannel();

    const offer = await connection.createOffer();
    connection.setLocalDescription(offer);

    signaling.on("offer", (answer) => {
        log("got answer");
        connection.setRemoteDescription(answer);
    });

    await signaling.sendOffer(offer);
    log("sent offer");

    while (channel.readyState !== "open") {
        // eslint-disable-next-line no-await-in-loop
        await delay(1000);
    }

    log("data channel ready");
    signaling.stopListening();

    setInterval(() => {
        channel.send(`hello there! :) ${new Date().toISOString()}`);
    }, 1000);
}

main().catch(console.error);
