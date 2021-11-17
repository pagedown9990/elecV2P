const cheerio = require('cheerio')

const { CONFIG } = require('../config')
const { errStack, euid, sType, sString, sJson, bEmpty, feedPush, iftttPush, barkPush, custPush, store, eAxios, jsfile, file, downloadfile, wsSer, message } = require('../utils')

const { exec } = require('../func/exec')

const $cache = {
  vals: new Map(),
  get(key){
    return this.vals.get(key)
  },
  set(key, value){
    return this.vals.set(key, value)
  },
  put(value, key) {
    return this.vals.set(key, value)
  },
  delete(key){
    return this.vals.delete(key)
  },
  keys(){
    return [...this.vals.keys()]
  },
  clear(){
    return this.vals.clear()
  }
}

const $cacheProxy = new Proxy($cache, {
  set(target, prop, val){
    switch (prop) {
    case 'size':
      throw new Error('forbid redefine $cache prop ' + prop)
    case 'get':
    case 'set':
    case 'put':
    case 'keys':
    case 'delete':
    case 'clear':
      throw new Error('forbid redefine $cache method ' + prop)
    default:
      return target.vals.set(prop, val)
    }
  },
  get(target, prop){
    switch (prop) {
    case 'size':
      return target.vals.size
    case 'get':
    case 'set':
    case 'put':
    case 'keys':
    case 'delete':
    case 'clear':
      return target[prop].bind(target)
    default:
      return target.vals.get(prop)
    }
  }
})

class contextBase {
  constructor({ fconsole, name }){
    this.console = fconsole
    this.__name  = name
  }

  setTimeout = setTimeout
  setInterval = setInterval
  clearTimeout = clearTimeout
  clearInterval = clearInterval

  __version = CONFIG.version
  __vernum  = CONFIG.vernum
  __home = CONFIG.homepage
  __efss = file.get(CONFIG.efss.directory, 'path')
  $ws = {
    send: wsSer.send
  }
  $exec = exec
  $cache = $cacheProxy
  $store = {
    get(key, type){
      return store.get(key, type)
    },
    put: (value, key, options) => {
      if (sType(options) === 'object') {
        if (!options.belong) {
          options.belong = this.__name
        }
      } else {
        options = {
          belong: this.__name,
          type: options
        }
      }
      return store.put(value, key, options)
    },
    set(key, value, options){
      return this.put(value, key, options)
    }
  }
  $axios = (request)=>{
    if (typeof(request) === 'string') {
      request = {
        url: request
      }
    }
    if (CONFIG.CONFIG_RUNJS.white && CONFIG.CONFIG_RUNJS.white.enable && CONFIG.CONFIG_RUNJS.white.list && CONFIG.CONFIG_RUNJS.white.list.length && CONFIG.CONFIG_RUNJS.white.list.indexOf(this.__name) !== -1) {
      // 白名单检测
      request.token = CONFIG.wbrtoken
    } else if (CONFIG.CONFIG_RUNJS.eaxioslog) {
      // 白名单之外才显示 url
      this.console.log(request.method || 'GET', request.url)
    }
    return eAxios(request, (CONFIG.CONFIG_RUNJS.proxy === false) ? false : null)
  }
  $cheerio = cheerio
  $message = message
  alert = message.success
  $download = downloadfile
  $evui = (obj, callback) => {
    if (sType(obj) !== 'object') {
      this.console.error('$evui expect a object in first arguments')
      return Promise.reject('$evui expect a object in first argument')
    }
    if (wsSer.recverlists.length === 0) {
      return Promise.reject('websocket is not ready yet, cant transfer $evui data to client')
    }
    if (obj.id === undefined) {
      obj.id = euid()
    }
    wsSer.send({ type: 'evui', data: { type: 'neweu', data: obj }})

    if (sType(callback) !== 'function' && (obj.cb || obj.callback)) {
      callback = obj.cb || obj.callback
    }

    return new Promise((resolve, reject)=>{
      if (obj.cbable) {
        wsSer.recv[obj.id] = data => {
          this.console.debug('$evui id:', obj.id, ', title:', obj.title, ', return data:', data)
          if (data === 'close') {
            wsSer.recv[obj.id] = null
            resolve(obj.title + ' is closed')
          } else if (sType(callback) === 'function') {
            // 保持和前端的持续交互，不 resolve
            callback(data)
          } else {
            this.console.debug('a callback function is expect to handle the data')
          }
        }
      } else {
        resolve('$evui is finished')
      }
    })
  }
  $feed = {
    push:  feedPush,
    ifttt: iftttPush,
    bark:  barkPush,
    cust:  custPush
  }
  $done = (data) => {
    this.console.debug('$done:', data)
    if (this.$vmEvent) {
      this.$vmEvent.emit(this.ok, data)
    }
    return data
  }
}

class surgeContext {
  constructor({ fconsole, name }){
    this.fconsole = fconsole
    this.__name = name
  }

  surgeRequest(req, cb) {
    if (typeof(req) === 'string') {
      req = {
        url: req
      }
    }
    if (CONFIG.CONFIG_RUNJS.white && CONFIG.CONFIG_RUNJS.white.enable && CONFIG.CONFIG_RUNJS.white.list && CONFIG.CONFIG_RUNJS.white.list.length && CONFIG.CONFIG_RUNJS.white.list.indexOf(this.__name) !== -1) {
      req.token = CONFIG.wbrtoken
    } else if (CONFIG.CONFIG_RUNJS.eaxioslog) {
      this.fconsole.log(req.method || 'GET', req.url)
    }
    let error = null,
        resps = {},
        sbody  = ''
    eAxios(req, (CONFIG.CONFIG_RUNJS.proxy === false) ? false : null).then(response=>{
      resps = {
        status: response.status,
        headers: response.headers,
      }
      if (resps['headers'] && resps['headers']['set-cookie'] && sType(resps['headers']['set-cookie']) === 'array') {
        resps['headers']['Set-Cookie'] = resps['headers']['set-cookie'].join(',')
      }
      sbody = sString(response.data)
    }).catch(err=>{
      error = errStack(err)
      this.fconsole.error('$httpClient', req.method || 'GET', req.url || req, error)
      if (err.response) {
        resps = {
          status: err.response.status,
          headers: err.response.headers,
        }
        sbody = sString(err.response.data)
      } else if (err.request) {
        error = `$httpClient ${req.method} ${req.url} error: ${error}`
        sbody = sString(req)
      } else {
        sbody = error
      }
    }).finally(async ()=>{
      if(cb && sType(cb) === 'function') {
        try {
          await cb(error, resps, sbody)
        } catch(err) {
          this.fconsole.error('$httpClient', req.method, req.url, 'callback', errStack(err, true))
        }
      }
    })
  }

  $httpClient = {
    get: (req, cb) => {
      this.surgeRequest(req, cb)
    },
    post: (req, cb) => {
      if (sType(req) === 'string') {
        req = { url: req }
      }
      req.method = 'post'
      this.surgeRequest(req, cb)
    },
    put: (req, cb) => {
      if (sType(req) === 'string') {
        req = { url: req }
      }
      req.method = 'put'
      this.surgeRequest(req, cb)
    },
    delete: (req, cb) => {
      if (sType(req) === 'string') {
        req = { url: req }
      }
      req.method = 'delete'
      this.surgeRequest(req, cb)
    }
  }
  $persistentStore = {
    read(key) {
      return store.get(key, 'string')
    },
    write: (value, key) => {
      return store.put(value, key, { belong: this.__name })
    }
  }
  $notification = {
    post: (...data) => {
      this.fconsole.notify(data.map(arg=>sString(arg)).join(' '))
      feedPush(data[0] + ' ' + data[1], data[2], data[3])
    }
  }
}

class quanxContext {
  constructor({ fconsole, name }){
    this.fconsole = fconsole
    this.__name = name
  }

  $task = {
    fetch: (req, cb) => {
      if (typeof(req) === 'string') {
        req = {
          url: req
        }
      }
      if (CONFIG.CONFIG_RUNJS.white && CONFIG.CONFIG_RUNJS.white.enable && CONFIG.CONFIG_RUNJS.white.list && CONFIG.CONFIG_RUNJS.white.list.length && CONFIG.CONFIG_RUNJS.white.list.indexOf(this.__name) !== -1) {
        req.token = CONFIG.wbrtoken
      } else if (CONFIG.CONFIG_RUNJS.eaxioslog) {
        this.fconsole.log(req.method || 'GET', req.url)
      }
      let resp = null
      return new Promise((resolve, reject) => {
        eAxios(req, (CONFIG.CONFIG_RUNJS.proxy === false) ? false : null).then(response=>{
          resp = {
            statusCode: response.status,
            headers: response.headers,
            body: sString(response.data)
          }
          if (resp['headers'] && resp['headers']['set-cookie'] && sType(resp['headers']['set-cookie']) === 'array') {
            resp['headers']['Set-Cookie'] = resp['headers']['set-cookie'].join(',')
          }
          resolve(resp)
        }).catch(error=>{
          resp = errStack(error)
          this.fconsole.error('$task.fetch', req.url, resp)
          reject({ error: resp })
        }).finally(async ()=>{
          if(cb && sType(cb) === 'function') {
            try {
              await cb(resp)
            } catch(err) {
              this.fconsole.error('$task.fetch callback', errStack(err, true))
            }
          }
        })
      })
    }
  }
  $prefs = {
    valueForKey(key) {
      return store.get(key, 'string')
    },
    setValueForKey: (value, key)=>{
      return store.put(value, key, { belong: this.__name })
    }
  }
  $notify = (...data)=>{
    this.fconsole.notify(data.map(arg=>sString(arg)).join(' '))
    feedPush(data[0] + ' ' + data[1], data[2], data[3])
  }
}

class context {
  constructor({ fconsole, name }){
    this.final = new contextBase({ fconsole, name })
  }

  add({ surge, quanx, addContext }){
    if (surge) {
      this.final.console.debug('启用 surge 兼容模式')
      Object.assign(this.final, new surgeContext({ fconsole: this.final.console, name: this.final.__name }))
    } else if (quanx) {
      this.final.console.debug('启用 quanx 兼容模式')
      Object.assign(this.final, new quanxContext({ fconsole: this.final.console, name: this.final.__name }))
    }
    if (addContext) {
      Object.assign(this.final, addContext)
    }
  }
}

module.exports = { context }