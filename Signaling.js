const EventEmitter = require("events");
const DHT = require("bittorrent-dht");
const ed = require("bittorrent-dht-sodium");
const crypto = require("crypto");
const zlib = require("zlib");
const log = require("./log");

const POLL_INTERVAL = 5000;

function compress(obj) {
    return new Promise((resolve, reject) => {
        zlib.deflate(Buffer.from(JSON.stringify(obj)), (error, result) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(result);
        });
    });
}

function decompress(buf) {
    return new Promise((resolve, reject) => {
        zlib.inflate(buf, (error, result) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(JSON.parse(result.toString("utf8")));
        });
    });
}

class Signaling extends EventEmitter {
    constructor(keyPair, password, cacheBurst = 1) {
        super();

        this.dht = new DHT();
        this.keyPair = {
            pk: Buffer.from(keyPair.pk, "hex"),
            sk: Buffer.from(keyPair.sk, "hex"),
        };
        this.password = Buffer.from(password, "hex");
        this.cacheBurst = cacheBurst;
        this.listening = false;
        this.receivedOffers = {};
        this.seq = 0;
        this.candidates = [];
        log("my id node id", this.dht.nodeId.toString("hex"));
    }

    async _send(bucket, value) {
        const bucketId = `${this.cacheBurst}:${bucket}`;
        const md5BucketId = crypto.createHash("md5").update(bucketId).digest();

        const bufCompressed = await compress(value);
        const message = {
            k: this.keyPair.pk,
            salt: md5BucketId,
            seq: this.seq++,
            v: bufCompressed,
            sign: this.sign.bind(this),
        };

        return new Promise((resolve, reject) => {
            this.dht.put(message, (err, hash) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(hash);
            });
        });
    }

    async sendOffer(offer) {
        const value = {
            id: this.dht.nodeId.toString("hex"),
            offer,
        };
        await this._send("offers", value);
    }

    async _sendCandidates() {
        if (this.candidates.length === 0) {
            return;
        }

        const value = {
            id: this.dht.nodeId.toString("hex"),
            candidates: this.candidates,
        };

        await this._send("icecandidates", value);

        log("sent ice candidates");

        this.candidates = [];
    }

    sendICECandidate(candidate) {
        this.candidates.push(candidate);
        if (this.ref) {
            clearTimeout(this.ref);
        }

        this.ref = setTimeout(() => {
            this._sendCandidates().catch(console.error);
        }, 5000);
    }

    startListening() {
        if (this.listening) {
            return;
        }
        this.listening = true;
        this.offersIntervalRef = setInterval(async () => {
            try {
                const parsed = await this.getBucket("offers");
                if (!parsed.offer || !parsed.id) {
                    return;
                }

                if (this.receivedOffers[parsed.id]) {
                    return;
                }

                this.receivedOffers[parsed.id] = true;

                if (!this.listening) {
                    return;
                }
                this.emit("offer", parsed.offer);
            } catch (e) {
                // console.log('get error', e);
            }
        }, POLL_INTERVAL);

        this.candidatesIntervalRef = setInterval(async () => {
            try {
                const parsedCandidate = await this.getBucket("icecandidates");
                if (!parsedCandidate.candidates || !parsedCandidate.id) {
                    return;
                }

                if (!this.receivedOffers[parsedCandidate.id]) {
                    return;
                }
                if (!this.listening) {
                    return;
                }
                log("got ice candidates");
                parsedCandidate.candidates.forEach((can) => {
                    this.emit("icecandidate", can);
                });
            } catch (e) {
                // console.log('get error', e);
            }
        }, POLL_INTERVAL);
    }

    async getBucket(bucket) {
        const md5Bucket = crypto.createHash("md5").update(`${this.cacheBurst}:${bucket}`).digest();
        const keyBuffer = this.dht._hash(Buffer.concat([this.password, md5Bucket]));

        const result = await this.queryDHT(keyBuffer.toString("hex"), md5Bucket);

        return decompress(result.v);
    }

    queryDHT(key, salt) {
        return new Promise((resolve, reject) => {
            const options = {
                verify: ed.verify,
                cache: false,
                salt,
            };
            this.dht.get(key, options, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!result) {
                    reject(new Error("no result"));
                    return;
                }
                resolve(result);
            });
        });
    }

    stopListening() {
        if (!this.listening) {
            return;
        }
        if (this.offersIntervalRef !== null) {
            clearInterval(this.offersIntervalRef);
        }
        this.offersIntervalRef = null;

        if (this.candidatesIntervalRef !== null) {
            clearInterval(this.candidatesIntervalRef);
        }
        this.candidatesIntervalRef = null;

        this.listening = false;
    }

    sign(buffer) {
        return ed.sign(buffer, this.keyPair.sk);
    }
}

module.exports = Signaling;
