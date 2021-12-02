const { RTCPeerConnection, RTCIceCandidate } = require("wrtc");
const Signaling = require("./Signaling");
const cacheInvalidation = require("./cacheInvalidation");
const log = require("./log");

const keyPair = {
    pk: "b083846e8e3a42d1ab9452ef780f2c4d193aa861a0af709ce928cec409cb42d3",
    sk: "10920af6059c69d629a2f5664150673d20617c8d54c15d0e34110dccd3fb30e9b083846e8e3a42d1ab9452ef780f2c4d193aa861a0af709ce928cec409cb42d3",
};
const password = "0bf403b6d23e4429cef8285aa33db2e9663db569eab9f41a0f53f5711576d013";

async function main() {
    const signaling = new Signaling(keyPair, password, cacheInvalidation);

    signaling.startListening();
    signaling.on("offer", async (offer) => {
        log("got offer");
        const connection = new RTCPeerConnection();

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

        connection.setRemoteDescription(offer);

        const answer = await connection.createAnswer();
        connection.setLocalDescription(answer);
        await signaling.sendOffer(answer);

        connection.ondatachannel = ({ channel }) => {
            log("data channel ready");
            signaling.stopListening();
            channel.addEventListener("message", (e) => {
                log(e.data);
            });
        };
    });
}

main().catch(console.error);
