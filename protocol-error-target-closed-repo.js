const EventEmitter = require('events');
const puppeteer = require('puppeteer');

process.setMaxListeners(0);

const DEFAULT_ARGS = [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-sandbox',
    '--no-zygote',
    '--disable-extensions',
    '--disable-webgl'];

const DELAY_TIME = 30*1000;

class Puppeteer extends EventEmitter{
    constructor (instance = 2) {
        super();
        this.instance = instance;
        this.browserList = [];
        this.refreshTimer = null;
        this.closeTimer = null;
        this.init();
    }

    init () {
        (async () => {
            console.log('init')
            for (let i=0; i<this.instance; i++) {
                const endpoint = await this.launchBroswer();
                this.browserList.push(endpoint);

                if (i === (this.instance - 1)) {
                    this.emit('change', this.browserList);

                    this.refreshTimer = setTimeout(() => {
                        this.refreshBroswer();
                    }, DELAY_TIME);
                }
            }
        })();
    }

    launchBroswer (retry = 1) {
        return puppeteer.launch({ args: DEFAULT_ARGS })
            .then(async (broswer) => {
                return await broswer.wsEndpoint();
            })
            .catch(err => {
                if (retry > 0) {
                    const nextRetry = retry - 1;
                    return this.launchBroswer(nextRetry);
                }
            });
    }

    async refreshBroswer () {
        clearTimeout(this.refreshTimer);
        console.log('refresh browser instance')

        const browserWSEndpoint = this.browserList.shift();
        try {
            await this.replaceBroswerInstance(browserWSEndpoint);
        } catch (err) {
            console.error('replace browser instance:', err);
        }

        try {
            const endpoint = await this.launchBroswer();
            this.browserList.push(endpoint);
            this.emit('change', this.browserList);
        } catch (err) {
            console.error('add browser instance:', err);
        }

        this.refreshTimer = setTimeout(() => {
            this.refreshBroswer();
        }, DELAY_TIME);
    }

    async replaceBroswerInstance (browserWSEndpoint, retry = 2) {
        clearTimeout(this.closeTimer)
        console.log('try to close browser instance:',browserWSEndpoint)
        const broswer = await puppeteer.connect({browserWSEndpoint});
        let openPages

        try{
            openPages = await broswer.pages();
        }catch (e) {
            // console.warn(broswer.isConnected(),broswer,broswer.target(),broswer.wsEndpoint())
            console.warn('get pages failed:',e)
            await broswer.close();
            process.exit(1)
            return
        }
        console.log(`close browser:openPages ${openPages.length}, retry ${retry}`)
        if (openPages && openPages.length > 1 && retry > 0) {
            const nextRetry = retry - 1;
            this.closeTimer = setTimeout(() => this.replaceBroswerInstance(browserWSEndpoint, nextRetry), 10 * 1000);
            return;
        }
        try {
            console.log('close browser instance')
            await broswer.close();
        } catch (err) {
            console.error('close browser instance:', err);
        }
    }
}


const BROSWER_INSTANCE = 2;
const broswerInstance = new Puppeteer(BROSWER_INSTANCE);
let broswerList = [];
broswerInstance.on('change', (data) => {
    broswerList = data;
    console.log('browser list change')
    startWork()
});


async function usePage(){
    try{
        const random = Math.floor(Math.random()* BROSWER_INSTANCE);
        const browserWSEndpoint = broswerList[random];
        const browser = await puppeteer.connect({ browserWSEndpoint }).catch((e) => {
            console.log(e)
        });
        if(!browser){
            console.log('browser is not valid')
            return
        }
        const page = await browser.newPage();
        page.setDefaultTimeout(10 * 60 * 1000)
        await page.goto('https://www.baidu.com')
        await page.waitFor(10 * 1000)
        await page.close()
    } catch (e) {
        console.log(e)
    }
}

function startWork(){
    setInterval(async () => {
        await usePage()
    },1000)
}
