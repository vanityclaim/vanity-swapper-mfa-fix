import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('turbo-ws');
import http2 from 'http2';
import readline from 'readline';

let swapperpassword;
let swappertoken;
let serverid;

const cH = {
    "User-Agent": "Mozilla/5.0",
    Authorization: "",
    "Content-Type": "application/json",
    Host: "canary.discord.com",
    "X-Super-Properties": "eyJicm93c2VyIjoiQ2hyb21lIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiQ2hyb21lIiwiY2xpZW50X2J1aWxkX251bWJlciI6MzU1NjI0fQ==",
    Cookie: "__dcfduid=e4b41870c0ea11ef8a7146a8012bdadc; __sdcfduid=e4b41870c0ea11ef8a7146a8012bdadc03493787d783a0a0e2f5bb4db161f4576d6b6e54f9daa8327c5fd3f8134d09c4; __cfruid=4389eaa152d58b286c2a2fbc722d11935cc63ac2-1739269782; _cfuvid=1Hc58Q1Yo6cXIWud4hS1_R5QFZMAJiiOVrOJIbWWkjI-1739269782714-0.0.1.1-604800000; cf_clearance=BdF_ewiRLaPoYyreIprXJkSVWfXVCQMQ1h7MIt1mY_o-1739277321-1.2.1.1-JmKhJ2BweCe_XyyQVVm5dNUm.fDE6NVE27a_qVOMTDXYsq_5dEoSObcNJfqQs2Lw5UC8mmAQ72IvYgqx3EjfL2inLPj7SqQJEfY6Cd2RT1FbZDqW.XVk60yGUBLqH8eoH9cp_UP_D.df5583FWOR3NKcdVtXVqd3SEntmDoIe1WVDVkf9f4U_LRIioqUfA3zqrWFSDYK7ZQb0eoG_PBi7Ps_cxnparGFk3Q.xOF4xhNXLOuYOt6piurTczIxdITUy5tUHvLlW5S4in5fzEqQ762fw8I2PhChSov7LV1x0Og"
};

let mfaToken1;
let session;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const log = (msg, type = 'default') => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const colors = {
        info: '\x1b[36m',
        success: '\x1b[32m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
        default: '\x1b[0m'
    };
    const prefix = {
        info: '[*]',
        success: '[+]',
        warn: '[!]',
        error: '[x]',
        default: '[·]'
    };
    console.log(`${colors[type]}${prefix[type]} [${timestamp}] ${msg}\x1b[0m`);
};

const http2Request = (method, path, customHeaders = {}, body = null) => {
    return new Promise((resolve, reject) => {
        const req = http2.connect("https://canary.discord.com").request({ ":method": method, ":path": path, ...customHeaders });
        let data = "";
        req.on("response", () => req.on("data", chunk => data += chunk).on("end", () => resolve(data)));
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
};

function connectHTTP2() {
    if (session) session.close();
    session = http2.connect("https://canary.discord.com", {
        settings: {
            enablePush: false
        }
    });
    session.on("error", () => {
        setTimeout(connectHTTP2, 50);
    });
    session.on("close", () => {
        setTimeout(connectHTTP2, 50);
    });
}

async function handleMFA() {
    try {
        const resData = await http2Request("PATCH", "/api/guilds/0/vanity-url", cH);
        const { mfa } = JSON.parse(resData);
        if (!mfa?.ticket) {
            log("MFA Error: Check token", 'error');
            setTimeout(handleMFA, 30000);
            return;
        }

        const { token } = JSON.parse(await http2Request("POST", "/api/mfa/finish", cH, JSON.stringify({
            ticket: mfa.ticket,
            mfa_type: "password",
            data: swapperpassword
        })));

        if (!token) {
            log("MFA Error: Check password", 'error');
            setTimeout(handleMFA, 30000);
            return;
        }

        mfaToken1 = token;
        log(`MFA Token Updated: ${mfaToken1.slice(0, 10)}***`, 'info');
    } catch (error) {
        log(`MFA Critical Error: ${error.message}`, 'error');
        setTimeout(handleMFA, 30000);
    }
}

async function deleteInvite(vanityCode) {
    try {
        await http2Request("DELETE", `/api/invite/${vanityCode}`, { ...cH, "X-Discord-MFA-Authorization": mfaToken1 });
        log(`Successfully Deleted/Checked Vanity: ${vanityCode}`, 'success');
    } catch (e) {
        log(`Delete Failed (Safe to ignore if already gone): ${e.message}`, 'warn');
    }
}

async function patchVanityUrl(vanityCode) {
    try {
        const patchResponse = await http2Request("PATCH", `/api/guilds/${serverid}/vanity-url`, { ...cH, "X-Discord-MFA-Authorization": mfaToken1 }, JSON.stringify({ code: vanityCode }));
        const parsed = JSON.parse(patchResponse);
        if (parsed.code === vanityCode) {
            log(`Vanity Successfully Claimed: ${vanityCode}`, 'success');
        } else {
            log(`Vanity Claim Failed: ${patchResponse}`, 'error');
        }
    } catch (e) {
        log(`Patch Error: ${e.message}`, 'error');
    }
}

async function fetchServerInfo(id) {
    try {
        const resData = await http2Request("GET", `/api/guilds/${id}`, cH);
        const data = JSON.parse(resData);
        if (data.name) {
            return data.name;
        } else {
            log(`Could not fetch server name for ID: ${id}. Response: ${resData}`, 'warn');
            return null;
        }
    } catch (error) {
        log(`Error fetching server info: ${error.message}`, 'error');
        return null;
    }
}

async function validateToken(token) {
    try {
        const resData = await http2Request("GET", "/api/users/@me", { ...cH, Authorization: token });
        const data = JSON.parse(resData);
        if (data.id) {
            log(`Token Valid: ${data.username}#${data.discriminator} (${data.id})`, 'success');
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function promptSwap() {
    rl.question('\x1b[36m[?] Enter vanity code to swap: \x1b[0m', async (code) => {
        const cleanCode = code.trim();
        if (cleanCode) {
            log(`Starting manual swap for: ${cleanCode}`, 'info');
            await deleteInvite(cleanCode);
            await patchVanityUrl(cleanCode);
        } else {
            log("No code entered.", "warn");
        }
        promptSwap();
    });
}

async function startBot() {
    console.clear();
    log(`Initializing Manual Swapper...`, 'info');

    swappertoken = await new Promise(resolve => {
        rl.question('\x1b[36m[?] Enter Swapper Token: \x1b[0m', (ans) => {
            resolve(ans.trim());
        });
    });

    if (!swappertoken) {
        log("Token is required.", "error");
        process.exit(1);
    }

    const isValid = await validateToken(swappertoken);
    if (!isValid) {
        log("Invalid Token. Exiting...", "error");
        process.exit(1);
    }

    cH.Authorization = swappertoken;

    swapperpassword = await new Promise(resolve => {
        rl.question('\x1b[36m[?] Enter Password (MFA): \x1b[0m', (ans) => {
            resolve(ans.trim());
        });
    });

    if (!swapperpassword) {
        log("Password is required for MFA.", "error");
        process.exit(1);
    }

    const inputServerId = await new Promise(resolve => {
        rl.question('\x1b[36m[?] Enter Server ID: \x1b[0m', (ans) => {
            resolve(ans.trim());
        });
    });

    if (!inputServerId) {
        log("Server ID is required.", "error");
        process.exit(1);
    }

    serverid = inputServerId;
    const serverName = await fetchServerInfo(serverid);

    if (serverName) {
        log(`Connected to Server: ${serverName} (${serverid})`, 'success');
    } else {
        log(`Proceeding with Server ID: ${serverid} (Name could not be verified)`, 'warn');
    }

    connectHTTP2();
    await handleMFA();

    setInterval(handleMFA, 290000);
    setInterval(() => {
        if (session && !session.destroyed) {
            session.request({ ":method": "HEAD", ":path": "/api/v10/gateway" }).end();
        }
    }, 900000);

    promptSwap();
}

startBot();
