const formidable = require('formidable')
const homedir = require('os').homedir()

const { logger, errStack, file } = require('../utils')
const clog = new logger({ head: 'wbcrt' })

const { clearCrt, newRootCrt, cacheClear } = require('../func')

module.exports = app => {
  app.get('/crt', (req, res)=>{
    clog.notify((req.headers['x-forwarded-for'] || req.connection.remoteAddress), 'download rootCA.crt')
    res.download(homedir + '/.anyproxy/certificates/rootCA.crt')
  })

  app.put('/crt', (req, res)=>{
    let op = req.body.op
    switch(op){
      case 'new':
        newRootCrt(req.body.data).then(({ crtPath })=>{
          res.json({
            rescode: 0,
            message: 'new rootCA generated at: ' + crtPath
          })
        }).catch(error=>{
          res.json({
            rescode: -1,
            message: 'fail to generate new rootCA: ' + errStack(error)
          })
        })
        break
      case 'clearcrt':
        clearCrt()
        res.json({
          rescode: 0,
          message: 'all certificates cleared except rootCA'
        })
        break
      default: {
        res.status(405).json({
          rescode: 405,
          message: 'unknow operation ' + op
        })
      }
    }
  })

  app.post('/crt', (req, res) => {
    clog.info((req.headers['x-forwarded-for'] || req.connection.remoteAddress), 'uploading rootCA')
    const uploadfile = new formidable.IncomingForm()
    uploadfile.maxFieldsSize = 2 * 1024 * 1024 //限制为最大2M
    uploadfile.keepExtensions = true
    uploadfile.multiples = true
    uploadfile.parse(req, (err, fields, files) => {
      if (err) {
        clog.error('rootCA upload Error', errStack(err))
        return res.json({
          rescode: -1,
          message: 'rootCA upload fail ' + err.message
        })
      }

      if (!files.crt) {
        clog.info('no crt file to upload')
        return res.json({
          rescode: -1,
          message: 'root crt files are expect'
        })
      }
      if (files.crt.length) {
        files.crt.forEach(sgfile=>{
          clog.notify('upload rootCA file:', sgfile.name)
          file.copy(sgfile.path, file.get('rootCA/' + sgfile.name, 'path'))
        })
      } else {
        clog.notify('upload rootCA file:', files.crt.name)
        file.copy(files.crt.path, file.get('rootCA/' + files.crt.name, 'path'))
      }
      return res.json({
        rescode: 0,
        message: 'upload success'
      })
    })
  })

  app.delete('/tempcaches', (req, res)=>{
    clog.notify((req.headers['x-forwarded-for'] || req.connection.remoteAddress), 'delete anyproxy temp cache')
    if (cacheClear()) {
      res.json({
        rescode: 0,
        message: 'anyproxy cache deleted'
      })
    } else {
      res.json({
        rescode: -1,
        message: 'fail to delete anyproxy cache'
      })
    }
  })
}