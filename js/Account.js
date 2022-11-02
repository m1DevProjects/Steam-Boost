const SteamUser = require('steam-user');
const steamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const SteamStore = require('steamstore');
const TradeOfferManager = require('steam-tradeoffer-manager');
const chalk = require('chalk');
const dayjs = require('dayjs');

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const EResult = require('../utility/EResult');
const EPurchaseResult = require('../utility/EResult');

function log(log, type){
    if(!type) return console.log(chalk.blue(dayjs().format('MM/DD/YYYY HH:mm:ss')), chalk.blue('LOG'), chalk.cyan(log));
    switch(type.toLowerCase()){
        case 'error': return console.log(chalk.blue(dayjs().format('MM/DD/YYYY HH:mm:ss')), chalk.red('ERROR'), chalk.red(log));
        case 'info': return console.log(chalk.blue(dayjs().format('MM/DD/YYYY HH:mm:ss')), chalk.magenta('INFO'), chalk.blue(log));
        case 'notif': return console.log(chalk.blue(dayjs().format('MM/DD/YYYY HH:mm:ss')), chalk.green('NOTIF'), chalk.blue(log));
        default: return console.log(chalk.blue(dayjs().format('MM/DD/YYYY HH:mm:ss')), chalk.brightBlue('LOG'), chalk.blue(log));
    }
}

module.exports = function(account){

    this.accountSettings = {
        communityEnabled: false,
        tradeoffersEnabled: false,
        idleEnabled: false
    }

    if(!account) return new Error(`You need to provide account details!`);
    if(!account.login) return new Error(`You need to provide account details!`);
    if(!account.password) return new Error(`You need to provide account details!`);
    if(!account.sharedSecret) return new Error(`You need to provide account details!`);
    if(!account.identitySecret) return log(`Identity secret not set.`, 'info');

    const { login, password, sharedSecret, identitySecret, parentalPin } = account;
    if(account) this.user = new SteamUser(); else this.user = null;
    if(sharedSecret) this.userCommunity = new SteamCommunity(); else this.userCommunity = null;
    if(identitySecret) this.userTrades = new TradeOfferManager(); else this.userTrades = null;
    this.userStore = new SteamStore({ "timeout": 30000 });
    this.user.logOn({
        accountName: login,
        password: password,
        twoFactorCode: steamTotp.generateAuthCode(sharedSecret),
        rememberPassword: true,
        machineName: 'Steam Idle',
        clientOS: 20
    });
    this.user.on('loggedOn', (details, parental) => { this.steamId64 = details.client_supplied_steamid; log(`Account ${login} (${this.steamId64}) logged in!`, 'info') });
    this.user.on('error', (err) => log(`${err}`, 'error'));
    this.user.on('disconnected', (resultCode, message) => log(`${EResult[resultCode]} | Disconnect message: ${message}`, 'error'));
    this.user.on('steamGuard', function(domain, callback, lastCodeWrong) {
        if(lastCodeWrong) log(`Last code provided was wrong!`, 'error')
        rl.question(`${chalk.blue(dayjs().format('MM/DD/YYYY HH:mm:ss'))} ${chalk.red('ERROR')} ${chalk.red(`Steam Guard code needed: `)}`, function (code) { 
            callback(code); rl.close();
        });
    });
    this.user.on('webSession', async (sessionID, cookies) => {
        try {
            this.userCommunity.setCookies(cookies);
            this.userStore.setCookies(cookies);
            if(parentalPin){
                this.userTrades.setCookies(cookies, parentalPin, err => { if(err) return log(`Couldn't set cookies for TradeOffer manager!`, 'error') });
                this.userTrades.setDisplayLanguages('english');
            }
        } catch(err){ console.log(err) };
        this.userCommunity.parentalUnlock(parentalPin, (err) => { if(err) return console.log(err) });
        setTimeout(() => {
            this.userCommunity.getWebApiKey('SteamIdle', (err, key) => {
                if(err) return console.log(`Couldn't get your WebAPI key, there will be a problem with using Steam's API! ${err}`);
                this.apiKey = key;
            });
        }, 3000);
    });
    this.getAPIKey = async () => {
        const key = await this.userCommunity.getWebApiKey('SteamIdle', (err, key) => {
            if(err) return console.log(`Couldn't get your WebAPI key, there will be a problem with using Steam's API! ${err}`);
            this.apiKey = key;
            return key;
        }); return key;
    }
    this.user.on('newItems', (count) => {
        return log(`You have ${count} new items.`, 'notif');
    });
    this.user.on('newComments', (count, myItems) => {
        return log(`You have ${count} new comments and ${myItems} from them, are related to your content.`, 'notif');
    });
    this.user.on('tradeOffers', (count) => {
        return log(`You have ${count} new tradeoffers.`, 'notif');
    });
    this.user.on('communityMessages', (count) => {
        return log(`You have ${count} new community (moderator) messages.`, 'notif');
    });
    this.user.on('offlineMessages', (count, friends) => {
        return log(`You have ${count} new messages received while you were offline. Messages are from: ${friends.join(', ')}`, 'notif');
    });
    this.addFreeLicense = async (licenseID) => {
        return new Promise(async (resolve, reject) => {
            const res = await this.userStore.addFreeLicense(licenseID, (err) => {
                if(err) return { success: false, err };
                return { success: true };
            });
            resolve(res);
        });
    }
    this.redeemWalletCode = async (walletCode) => {
        return new Promise(async (resolve, reject) => {
            const res = await this.userStore.checkWalletCode(walletCode, (err, eresult, detail, redeemable, amount, currencyCode) => {
                if(err) return { success: false, err };
                const checkResult = {
                    success: true,
                    details: {
                        activationResult: EResult[eresult],
                        purchaseResult: EPurchaseResult[detail],
                        redeemable,
                        amount,
                        currencyCode
                    }
                };
            });
            if(!res?.success) return reject('Wrong wallet code!');
            const res2 = await this.userStore.redeemWalletCode(walletCode, (err, eresult, detail, formattedNewWalletBalance, amount) => {
                if(err) return { success: false, err };
                return {
                    success: true,
                    details: {
                        activationResult: EResult[eresult],
                        purchaseResult: EPurchaseResult[detail],
                        formattedNewWalletBalance ,
                        amount
                    }
                };
            });
            if(!res2?.success) return reject('Wrong wallet code!');
            resolve(res2);
        });
    }
}