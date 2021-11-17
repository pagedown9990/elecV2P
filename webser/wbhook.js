const os = require('os')
const { taskMa, exec } = require('../func')
const { CONFIG_RULE, runJSFile } = require('../script')

const { logger, LOGFILE, Jsfile, list, nStatus, sString, sType, surlName, sBool, stream, downloadfile, now, checkupdate, store, kSize, errStack, sbufBody, wsSer } = require('../utils')
const clog = new logger({ head: 'webhook', level: 'debug' })

const { CONFIG } = require('../config')

function handler(req, res){
  res.set({ 'Access-Control-Allow-Origin': '*' })
  if (!CONFIG.wbrtoken) {
    return res.status(500).json({
      rescode: -1,
      message: 'webhook token not set yet'
    })
  }
  const rbody = Object.assign(req.body || {}, req.query || {})
  if (rbody.token !== CONFIG.wbrtoken) {
    return res.status(403).json({
      rescode: 403,
      message: 'token is illegal'
    })
  }
  const clientip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
  clog.notify(clientip, 'run webhook type', rbody.type)
  switch(rbody.type) {
  case 'jslist':
    res.json(Jsfile.get('list'))
    break
  case 'jsrun':
  case 'runjs':
    let fn = rbody.fn || ''
    if (!rbody.rawcode && !fn) {
      clog.info('can\'t find any javascript code to run')
      return res.status(400).json({
        rescode: 400,
        message: 'can\'t find any javascript code to run'
      })
    } else {
      const addContext = {
        from: 'webhook'
      }
      let showfn = ''
      if (rbody.rawcode) {
        addContext.type = 'rawcode'
        fn = rbody.rawcode
        showfn = 'rawcode.js'
      } else if (/^https?:\/\/\S{4,}/.test(fn)) {
        showfn = surlName(fn)
      } else {
        showfn = fn
      }
      if (rbody.rename) {
        if (!/\.js$/i.test(rbody.rename)) {
          rbody.rename += '.js'
        }
        addContext.rename = rbody.rename
        showfn = rbody.rename
      }
      if (sType(rbody.env) === 'object') {
        addContext.env = rbody.env
      }
      if (rbody.grant) {
        addContext.grant = rbody.grant
      }
      addContext.timeout = 5000
      res.writeHead(200, { 'Content-Type': 'text/plain;charset=utf-8' })
      runJSFile(fn, addContext).then(data=>{
        if (data) {
          res.write(sbufBody(data))
        } else {
          res.write(showfn + ' don\'t return any value')
        }
      }).catch(error=>{
        res.write('error: ' + error)
      }).finally(()=>{
        showfn = showfn.replace(/\/|\\/g, '-')
        let homepage = CONFIG.homepage || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`
        res.write(`\n\nconsole log file: ${homepage}/logs/${showfn}.log\n\n`)
        let oldlog = LOGFILE.get(showfn + '.log')
        if (oldlog) {
          oldlog.pipe(res)
        } else {
          res.end()
        }
      })
    }
    break
  case 'deljs':
  case 'jsdel':
  case 'deletejs':
  case 'jsdelete':
    if (rbody.op === 'clear') {
      return res.json({
        rescode: 0,
        message: 'all file without .js extname on JSFile folder is cleared',
        delfile: Jsfile.clear()
      })
    }
    if (!rbody.fn) {
      return res.json({
        rescode: -1,
        message: 'a parameter fn is expect'
      })
    }
    let jsfn = rbody.fn
    clog.info(clientip, 'delete javascript file', jsfn)
    let bDelist = Jsfile.delete(jsfn)
    if (bDelist) {
      if (sType(bDelist) === 'array') {
        res.json({
          rescode: 0,
          message: bDelist.join(', ') + ' success delete'
        })
      } else {
        res.json({
          rescode: 0,
          message: jsfn + ' success delete'
        })
      }
    } else {
      res.json({
        rescode: -1,
        message: jsfn + ' not exist'
      })
    }
    break
  case 'jsfile':
    if (!rbody.fn) {
      return res.json({
        rescode: -1,
        message: 'a parameter fn is expect'
      })
    }
    switch (rbody.op) {
    case 'put':
      if (!rbody.rawcode) {
        return res.json({
          rescode: -1,
          message: 'a parameter rawcode is expect'
        })
      }
      if (Jsfile.put(rbody.fn, rbody.rawcode)) {
        res.json({
          rescode: 0,
          message: 'success save ' + rbody.fn
        })
      } else {
        res.json({
          rescode: -1,
          message: 'fail to save ' + rbody.fn
        })
      }
      break
    case 'get':
    default:
      let jsfilecont = Jsfile.get(rbody.fn)
      if (jsfilecont) {
        res.send(jsfilecont)
      } else {
        res.status(404).json({
          rescode: 404,
          message: rbody.fn + ' not exist'
        })
      }
    }
    break
  case 'logdelete':
  case 'deletelog':
    let name = rbody.fn
    clog.info(clientip, 'delete log', name)
    if (LOGFILE.delete(name)) {
      res.json({
        rescode: 0,
        message: name + ' success delete'
      })
    } else {
      res.json({
        rescode: -1,
        message: name + ' log file not exist'
      })
    }
    break
  case 'logget':
  case 'getlog':
    if (!rbody.fn) {
      return res.json({
        rescode: -1,
        message: 'parameter fn is expect'
      })
    }
    clog.info(clientip, 'get log', rbody.fn)
    let logcont = LOGFILE.get(rbody.fn)
    if (logcont) {
      if (sType(logcont) === 'array') {
        res.json(logcont)
      } else {
        logcont.pipe(res)
      }
    } else {
      res.status(404).json({
        rescode: 404,
        message: rbody.fn + ' not exist'
      })
    }
    break
  case 'status':
    clog.info(clientip, 'get server status')
    let status = nStatus()
    status.start = now(CONFIG.start, false)
    status.uptime = ((Date.now() - Date.parse(status.start))/1000/60/60).toFixed(2) + ' hours'
    status.version = CONFIG.version
    status.task = taskMa.status()
    res.json(status)
    break
  case 'task':
    clog.info(clientip, 'get all task')
    res.json(taskMa.info())
    break
  case 'taskinfo':
    clog.info(clientip, 'get taskinfo', rbody.tid)
    if (!rbody.tid || rbody.tid === 'all') {
      let status = taskMa.status()
      status.info = taskMa.info()
      res.json(status)
    } else {
      let taskinfo = taskMa.info(rbody.tid)
      if (taskinfo) {
        return res.json(taskinfo)
      }
      res.json({
        rescode: -1,
        message: 'no such task with taskid: ' + rbody.tid
      })
    }
    break
  case 'taskstart':
    clog.notify(clientip, 'start task', rbody.tid)
    res.json(taskMa.start(rbody.tid))
    break
  case 'taskstop':
    clog.notify(clientip, 'stop task', rbody.tid)
    res.json(taskMa.stop(rbody.tid))
    break
  case 'taskadd':
    clog.notify(clientip, 'add new task')
    res.json(taskMa.add(rbody.task, rbody.options))
    break
  case 'tasksave':
    clog.notify(clientip, 'save current task list')
    res.json(taskMa.save())
    break
  case 'taskdel':
  case 'taskdelete':
  case 'deltask':
  case 'deletetask':
    clog.notify(clientip, 'delete task', rbody.tid)
    res.json(taskMa.delete(rbody.tid))
    break
  case 'download':
  case 'downloadfile':
    clog.notify(clientip, 'start download file to', rbody.folder || 'efss')
    if (rbody.url && /^https?:\/\/\S{4,}/.test(rbody.url)) {
      downloadfile(rbody.url, { folder: rbody.folder, name: rbody.name }).then(dest=>{
        clog.info(rbody.url, 'download to', dest)
        res.json({
          rescode: 0,
          message: 'success download ' + rbody.url + ' to ' + dest
        })
      }).catch(e=>{
        clog.error('download', rbody.url, 'error', e)
        res.json({
          rescode: -1,
          message: 'fail to download ' + rbody.url + ' error: ' + e
        })
      })
    } else {
      clog.error('wrong download url', rbody.url)
      res.json({
        rescode: -1,
        message: 'wrong download url ' + rbody.url
      })
    }
    break
  case 'stream':
    clog.notify(clientip, 'stream from', rbody.url)
    if (rbody.url && rbody.url.startsWith('http')) {
      stream(rbody.url).then(response=>{
        response.pipe(res)
      }).catch(e=>{
        res.json({
          rescode: -1,
          message: e
        })
      })
    } else {
      clog.error('wrong stream url', rbody.url)
      res.json({
        rescode: -1,
        message: 'wrong stream url ' + req.query.url
      })
    }
    break
  case 'exec':
  case 'shell':
    clog.notify(clientip, 'exec shell command', rbody.command, 'from webhook')
    if (rbody.command && sType(rbody.command) === 'string') {
      res.writeHead(200, { 'Content-Type': 'text/plain;charset=utf-8' })
      let command = decodeURI(rbody.command)
      let option  = {
        timeout: 5000, from: 'webhook',
        cb(data, error, finish) {
          if (finish) {
            res.end('\ncommand: ' + command + ' finished')
          } else if (error) {
            clog.error(error)
            res.write(error)
          } else {
            res.write(data)
          }
        }
      }
      if (rbody.cwd !== undefined) {
        option.cwd = rbody.cwd
      }
      if (rbody.timeout !== undefined) {
        option.timeout = Number(rbody.timeout)
      }
      exec(command, option)
    } else {
      res.json({
        rescode: -1,
        message: 'command parameter is expect'
      })
    }
    break
  case 'info':
    let elecV2PInfo = {
      elecV2P: {
        version: CONFIG.version,
        start: now(CONFIG.start, false),
        uptime: ((Date.now() - CONFIG.start)/1000/60/60).toFixed(2) + ' hours',
        taskStatus: taskMa.status(),
        memoryUsage: nStatus(),
      },
      system: {
        arch: os.arch(),
        platform: os.platform(),
        version: os.version(),
        homedir: os.homedir(),
        freememory: kSize(os.freemem()),
        totalmemory: kSize(os.totalmem()),
        hostname: os.hostname(),
      },
      client: {
        ip: clientip,
        url: req.url,
        method: req.method,
        protocol: req.protocol,
        hostname: req.hostname,
        body: rbody,
        'user-agent': req.headers['user-agent'],
      }
    }

    if (req.headers['x-forwarded-for']) {
      elecV2PInfo.client['x-forwarded-for'] = req.headers['x-forwarded-for']
    }

    if (rbody.debug) {
      elecV2PInfo.elecV2P.webhooktoken = CONFIG.wbrtoken

      elecV2PInfo.system.userInfo = os.userInfo()
      elecV2PInfo.system.uptime = (os.uptime()/60/60).toFixed(2) + ' hours'
      elecV2PInfo.system.loadavg = os.loadavg()
      elecV2PInfo.system.cpus = os.cpus()
      elecV2PInfo.system.networkInterfaces = os.networkInterfaces()

      elecV2PInfo.client.ips = req.ips
      elecV2PInfo.client.headers = req.headers
    }
    res.json(elecV2PInfo)
    break
  case 'update':
  case 'newversion':
  case 'checkupdate':
    checkupdate(Boolean(rbody.force)).then(body=>{
      res.json(body)
    })
    break
  case 'store':
    if (rbody.op === 'all') {
      return res.json(store.all())
    }
    if (!rbody.key) {
      clog.error('a key is expect on webhook store opration')
      return res.json({
        rescode: -1,
        message: 'a key is expect on webhook store opration'
      })
    }
    switch(rbody.op) {
    case 'put':
      clog.info('put store key', rbody.key, 'from webhook')
      if (store.put(rbody.value, rbody.key, rbody.options)) {
        clog.debug(`save ${ rbody.key } value: `, rbody.value, 'from webhook')
        res.json({
          rescode: 0,
          message: rbody.key + ' saved'
        })
      } else {
        res.json({
          rescode: -1,
          message: rbody.key + ' fail to save. maybe data length is over limit'
        })
      }
      break
    case 'delete':
      clog.info('delete store key', rbody.key, 'from webhook')
      if (store.delete(rbody.key)) {
        clog.notify(rbody.key, 'delete')
        res.json({
          rescode: 0,
          message: rbody.key + ' delete'
        })
      } else {
        clog.error('delete fail')
        res.json({
          rescode: -1,
          message: 'delete fail'
        })
      }
      break
    default:
      clog.info('get store key', rbody.key, 'from webhook')
      let storeres = store.get(rbody.key)
      if (storeres !== false) {
        res.send(sString(storeres))
      } else {
        res.json({
          rescode: -1,
          message: rbody.key + ' not exist'
        })
      }
    }
    break
  case 'security':
    if (rbody.op !== 'put') {
      return res.json(CONFIG.SECURITY)
    }
    let secMsg = ''
    if (rbody.enable !== undefined) {
      CONFIG.SECURITY.enable = sBool(rbody.enable)
      secMsg = `SECURITY enable: ${CONFIG.SECURITY.enable}\n`
    }
    if (rbody.blacklist !== undefined) {
      let secbltype = sType(rbody.blacklist)
      if (secbltype === 'array') {
        CONFIG.SECURITY.blacklist = rbody.blacklist
      } else if (secbltype === 'string') {
        CONFIG.SECURITY.blacklist = rbody.blacklist.split(/\r|\n|,/).filter(v=>v.trim())
      } else {
        return res.json({
          rescode: -1,
          message: 'blacklist type is wrong'
        })
      }
      secMsg += `SECURITY blacklist is updated\n`
    }
    if (rbody.whitelist !== undefined) {
      let secwltype = sType(rbody.whitelist)
      if (secwltype === 'array') {
        CONFIG.SECURITY.whitelist = rbody.whitelist
      } else if (secwltype === 'string') {
        CONFIG.SECURITY.whitelist = rbody.whitelist.split(/\r|\n|,/).filter(v=>v.trim())
      } else {
        return res.json({
          rescode: -1,
          message: 'whitelist type is wrong'
        })
      }
      secMsg += `SECURITY whitelist is updated`
    }
    if (secMsg) {
      list.put('config.json', CONFIG)
    }
    res.json({
      rescode: 0,
      message: secMsg.trim() || 'SECURITY config not changed',
      SECURITY: CONFIG.SECURITY
    })
    break
  case 'proxyport':
    wsSer.recv.eproxy(rbody.op === 'open' ? 'start' : 'close')
    res.json({
      rescode: 0,
      message: `proxy port ${CONFIG.anyproxy.port} is ${rbody.op === 'open' ? 'open' : 'close'}`
    })
    break
  case 'devdebug':
    // temp debug, 待完成 unfinished
    switch(rbody.get){
    case 'rule':
      res.send(rbody.key ? CONFIG_RULE[rbody.key] : CONFIG_RULE)
      break
    case 'rulecache':
      res.send(sString(rbody.key ? CONFIG_RULE.cache[rbody.key] : CONFIG_RULE.cache.host))
      break
    case 'wsclient':
      res.send(sString(wsSer.recver))
      break
    case 'config':
      res.json(CONFIG)
      break
    case 'minishell':
      if (rbody.op === 'open') {
        CONFIG.minishell = true
      } else if (rbody.op === 'close') {
        CONFIG.minishell = false
      }
      res.json({ minishell: CONFIG.minishell })
      break
    default:
      res.send('dev debug')
    }
    break
  case 'help':
    // 待完成 unfinished
    return res.json({
      title: 'elecV2P webhook help',
      url: 'https://github.com/elecV2/elecV2P-dei/tree/master/docs/09-webhook.md',
      api: [
        {
          type: 'status',
          note: 'get elecV2P memoryUsage status and so on',
          para: null
        },
        {
          type: 'jslist',
          note: 'get elecV2P local js file lists',
          para: null
        },
        {
          type: 'runjs',
          note: 'run a javascript',
          para: [
            {
              name: 'fn',
              note: 'javascript file name or a http url of the javascript',
              need: 'required'
            },
            {
              name: 'rawcode',
              note: 'this raw javascript code to run.(if fn is missing, the rawcode is required)',
              need: 'optional'
            },
            {
              name: 'rename',
              note: 'rename the javascript file or code',
              need: 'optional'
            },
            {
              name: 'env',
              note: 'the extra environment variable when run this javascript',
              need: 'optional'
            }
          ]
        }
      ]
    })
    break
  default:
    return res.json({
      rescode: -1,
      message: 'webhook type ' + rbody.type + ' not support yet'
    })
  }
}

module.exports = app => {
  app.get("/webhook", handler)
  app.put("/webhook", handler)
  app.post("/webhook", handler)
}