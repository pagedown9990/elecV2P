const fs = require('fs')
const path = require('path')
const os = require('os')
const Zip = require('adm-zip')

const { errStack, sJson, sString, sType, sBool, bEmpty, iRandom, euid, kSize } = require('./string')
const { now } = require('./time')
const { logger } = require('./logger')
const clog = new logger({ head: 'utilsFile', level: 'debug' })

const { CONFIG } = require('../config')

const fpath = {
  list: path.join(__dirname, '../script', 'Lists'),
  js: path.join(__dirname, '../script', 'JSFile'),
  store: path.join(__dirname, '../script', 'Store'),
  homedir: os.homedir(),
  tempdir: os.tmpdir()
}

if (!fs.existsSync(fpath.list)) {
  fs.mkdirSync(fpath.list, { recursive: true })
  clog.notify('mkdir new Lists folder')
}

if (!fs.existsSync(fpath.js)) {
  fs.mkdirSync(fpath.js, { recursive: true })
  clog.notify('mkdir new JSFile folder')
}

if (!fs.existsSync(fpath.store)) {
  fs.mkdirSync(fpath.store, { recursive: true })
  clog.notify('mkdir new Store folder')
}

const list = {
  get(name, type){
    let listpath = path.join(fpath.list, name)
    if (type === 'path') {
      return listpath
    }
    if (fs.existsSync(listpath)) {
      let liststr = fs.readFileSync(listpath, "utf8")
      let listobj = sJson(liststr)
      switch(name) {
      case 'mitmhost.list':
        if (listobj?.mitmhost?.list) {
          return listobj.mitmhost
        }
        return {
          list: liststr.split(/\r|\n/).filter(host=>!(/^(\[|#|;)/.test(host) || host.length < 3))
        }
        break
      case 'rewrite.list':
        if (listobj?.rewrite?.list) {
          return listobj
        }
        return {
          rewrite: {
            note: 'elecV2P rewrite list',
            list: []
          }
        }
        break
      case 'default.list':
        if (listobj?.rules?.list) {
          return listobj
        }
        return {
          rules: {
            note: 'elecV2P rules list',
            list: []
          }
        }
        break
      default:
        return liststr
      }
    }
    clog.error('no list', name)
    return ''
  },
  put(name, cont, option = {}){
    try {
      if (option.type === 'add') {
        if (name === 'mitmhost.list') {
          let orglist = this.get('mitmhost.list')
          let listadd = (host, note = '', enable = true)=>{
            let fhost = orglist.list.find(x=>x.host === host)
            if (fhost) {
              fhost.enable = sBool(enable)
              if (note && fhost.note !== note) {
                if (fhost.note) {
                  fhost.note += '|' + note
                } else {
                  fhost.note = note
                }
              }
            } else {
              orglist.list.push({
                host, note, enable: sBool(enable)
              })
            }
          }
          let contype = sType(cont)
          if (contype === 'string') {
            if (cont.length > 2) {
              listadd(cont, option.note)
            }
          } else if (contype === 'array') {
            cont.forEach(host=>{
              if (typeof(host) === 'string' && host.length>2) {
                listadd(host, option.note)
              } else if (typeof(host) === 'object' && host.host) {
                listadd(host.host, option.note, host.enable)
              }
            })
          } else {
            clog.error('mitmhost.list addition put error: unknow cont type')
            return false
          }
          cont = { mitmhost: orglist }
        }
      }
      fs.writeFileSync(path.join(fpath.list, name), sType(cont) === 'object' ? JSON.stringify(cont, null, 2) : sString(cont), 'utf8')
      clog.info(name, 'updated')
      return true
    } catch(e) {
      clog.error('put list file error', name, e.stack)
      return false
    }
  }
}

const file = {
  get(pname, type){
    if (bEmpty(pname)) {
      clog.info('a first parameter is expect, file.get no result')
      return
    }
    pname = pname.replace(/^(\$home|~)/i, fpath.homedir)
    pname = pname.replace(/^\$(temp|tmp)/i, fpath.tempdir)
    let filepath = path.resolve(__dirname, '../', pname)
    if (type === 'path') {
      return filepath
    }
    if (fs.existsSync(filepath)) {
      if (fs.statSync(filepath).isDirectory()) {
        return filepath + ' is a directory'
      }
      return fs.readFileSync(filepath, 'utf8')
    }
    clog.error(pname, 'not exist')
  },
  delete(fname, basepath) {
    basepath && (fname = path.join(basepath, fname))
    if (fs.existsSync(fname)) {
      fs.rmSync(fname, { recursive: true, force: true })
      clog.info('delete file', fname)
      return true
    } else {
      clog.info('file', fname, 'no exist')
      return false
    }
  },
  save(fpath, fcont, cb=()=>{}){
    clog.info(`save file to ${fpath}`)
    let folder = path.dirname(fpath)
    if (!fs.existsSync(folder)) {
      clog.info('mkdir', folder, 'for', fpath)
      fs.mkdirSync(folder, { recursive: true })
    }
    switch (sType(fcont)) {
    case 'buffer':
      break
    case 'object':
      fcont = JSON.stringify(fcont, null, 2)
      break
    default:
      fcont = sString(fcont)
    }
    fs.writeFile(fpath, fcont, 'utf8', cb)
  },
  copy(source, target, cb=()=>{}){
    clog.info('copy', source, 'to', target)
    fs.copyFile(source, target, cb)
  },
  move(source, target, cb=()=>{}){
    clog.info('move', source, 'to', target)
    fs.rename(source, target, cb)
  },
  rename(oldPath, newPath, cb=()=>{}){
    // AKA - move
    clog.info('rename', oldPath, 'to', newPath)
    fs.rename(oldPath, newPath, cb)
  },
  mkdir(dir, cb=()=>{}){
    fs.mkdir(dir, { recursive: true }, cb)
  },
  path(x1, x2){
    if (!(x1 && x2)) return
    const rpath = path.resolve(x1, x2)
    if (fs.existsSync(rpath)) {
      return rpath
    }
  },
  isExist(filepath, isDir){
    if (bEmpty(filepath)) return false
    if (fs.existsSync(filepath)) {
      return isDir ? fs.statSync(filepath).isDirectory() : true
    }
    return false
  },
  size(filepath){
    if (fs.existsSync(filepath)) {
      const fsize = fs.statSync(filepath).size
      if (fsize > 1024*1024) {
        return (fsize/(1024*1024)).toFixed(2) + ' M'
      } else if (fsize > 1024) {
        return (fsize/1024).toFixed(2) + ' K'
      } else {
        return fsize + ' B'
      }
    }
    return 0
  },
  zip(filelist, targetfile){
    if (sType(filelist) !== 'array') {
      clog.error('a array parameter is expect when compress zip files')
      return false
    }
    if (filelist.length === 0) {
      clog.error('no files to compress')
      return false
    }
    let zip = new Zip()
    filelist.forEach(file=>{
      if (fs.existsSync(file)) {
        if (fs.statSync(file).isDirectory()) {
          clog.debug('add directory', file, 'to', targetfile)
          zip.addLocalFolder(file)
        } else {
          clog.debug('add file', file, 'to', targetfile)
          zip.addLocalFile(file)
        }
      } else {
        clog.error(file, 'not exist, skip compress')
      }
    })
    if (!targetfile) {
      targetfile = filelist[0] + '.etc.zip'
    } else if (!/\.zip$/.test(targetfile)) {
      targetfile = targetfile + '.zip'
    }
    zip.writeZip(targetfile)
    clog.info('success compress all files to', targetfile)
    return true
  },
  unzip(zipfile, targetpath, options = {}){
    if (fs.existsSync(zipfile)) {
      let zip = new Zip(zipfile)
      if (!targetpath) {
        targetpath = path.dirname(zipfile)
      }
      zip.extractAllTo(targetpath, options.overwrite)
      clog.info('success uncompress', zipfile, 'to', targetpath)
      if (options.filelist) {
        return this.aList(targetpath)
      }
      return true
    } else {
      clog.error(zipfile, 'not exist, cant unzip')
      return false
    }
  },
  aList(folder, option = { max: -1, dot: true, skip: { folder: [], file: [] } }, progress = { num: 0 }){
    if (!fs.existsSync(folder)) {
      clog.error('directory', folder, 'not exist')
      return null
    }
    folder = path.resolve(folder)
    let basename = path.basename(folder)
    if (Boolean(option.dot) === false && basename.startsWith('.')) {
      return null
    }
    let fstat = fs.statSync(folder)
    if (fstat.isDirectory()) {
      if (option.skip && option.skip.folder && option.skip.folder.indexOf(basename) !== -1) {
        clog.info('file aList skip folder', basename)
        return null
      }
      const rlist = fs.readdirSync(folder)
      let flist = []
      for (let fo of rlist) {
        if (option.max !== -1 && progress.num >= option.max) {
          break
        }
        flist.push(this.aList(path.join(folder, fo), option, progress))
      }
      return {
        type: 'directory',
        name: basename,
        list: flist.filter(f=>f),
        mtime: fstat.mtimeMs
      }
    } else {
      if (option.skip && option.skip.file && option.skip.file.indexOf(basename) !== -1) {
        clog.info('file aList skip file', basename)
        return null
      }
      if (option.max !== -1) {
        progress.num++
      }
      return {
        type: 'file',
        name: basename,
        size: kSize(fstat.size),
        mtime: fstat.mtimeMs
      }
    }
  },
  list({ folder, max=1000, dotfiles='deny', ext=[], noext=[], detail=false }) {
    // ext: 只返回该 extension 的文件, noext: 不包括该后缀名的文件
    if (!(folder && fs.existsSync(folder))) {
      return []
    }
    if (!fs.statSync(folder).isDirectory()) {
      return [folder]
    }
    if (!(max>0)) {
      return []
    }

    let curnum = 0, fnlist = [], subfolder = []
    while (curnum<max) {
      let subf = subfolder.length ? subfolder.shift() : ''
      let newfolder = path.join(folder, subf)
      let list = fs.readdirSync(newfolder)
      for (let fd of list) {
        if (dotfiles !== 'allow' && /^\./.test(fd)) {
          continue
        }
        let fstat = fs.statSync(path.join(newfolder, fd))
        if (fstat.isDirectory()) {
          subfolder.push((subf ? subf + '/' : '') + fd)
        } else {
          if (ext.length && ext.indexOf(path.extname(fd)) === -1) {
            continue
          }
          if (noext.length && noext.indexOf(path.extname(fd)) !== -1) {
            continue
          }
          if (detail) {
            fnlist.push({
              name: (subf ? subf + '/' : '') + fd,
              size: kSize(fstat.size),
              mtime: fstat.mtimeMs
            })
          } else {
            fnlist.push((subf ? subf + '/' : '') + fd)
          }
          curnum++
          if (curnum >= max) {
            return fnlist
          }
        }
      }

      if (subfolder.length === 0) {
        return fnlist
      }
    }

    return fnlist
  }
}

const Jsfile = {
  get(name, type){
    if (bEmpty(name)) {
      return false
    }
    name = name.trim()
    if (name === 'list') {
      return file.list({ folder: fpath.js, ext: ['.js'] }).sort()
    }
    if (!/\.js$/i.test(name)) {
      name += '.js'
    }
    let jspath = path.join(fpath.js, name)
    if (type === 'path') {
      return jspath
    }
    if (type === 'dir') {
      return path.dirname(jspath)
    }
    if (fs.existsSync(jspath)) {
      let fstat = fs.statSync(jspath)
      if (fstat.isDirectory()) {
        clog.error(jspath, 'is a directory')
        return false
      }
      if (type === 'date') {
        return fstat.mtimeMs
      }
      return fs.readFileSync(jspath, 'utf8')
    }
    clog.error('no such js file', name)
    return false
  },
  put(name, cont){
    if (!/\.js$/i.test(name)) {
      name += '.js'
    }
    try {
      let fullpath = path.join(fpath.js, name)
      let jsfolder = path.dirname(fullpath)
      if (!fs.existsSync(jsfolder)) {
        clog.info('mkdir', jsfolder, 'for', name)
        fs.mkdirSync(jsfolder, { recursive: true })
      }
      fs.writeFileSync(fullpath, sType(cont) === 'object' ? JSON.stringify(cont, null, 2) : sString(cont), 'utf8')
      clog.info(`${name} success saved`)
      return true
    } catch(e) {
      clog.error('put js file error', name, e.stack)
      return false
    }
  },
  delete(name){
    if (bEmpty(name)) {
      clog.info('first parameter is expect')
      return false
    }
    let delf = (name) => {
      if (!/\.js$/i.test(name)) {
        name += '.js'
      }
      let jspath = path.join(fpath.js, name)
      if (fs.existsSync(jspath)) {
        fs.unlinkSync(jspath)
        clog.info(name, 'deleted')
        return true
      } else {
        clog.error('no such js file:', name)
        return false
      }
    }

    switch (sType(name)) {
    case 'array':
      let delist = []
      name.forEach(n=>{
        if (delf(n)) {
          delist.push(n)
        }
      })
      if (delist.length) {
        return delist
      }
      return false
    case 'string':
    default:
      return delf(name)
    }
  },
  clear(){
    // 清空目录下非 JS 文件
    let nojslist = file.list({ folder: fpath.js, noext: ['.js'] })
    nojslist.forEach(f=>file.delete(f, fpath.js))
    return nojslist
  }
}

const store = {
  maxByte: 1024*1024*2,
  get(key, type) {
    // empty key return undefined, don't change
    if (bEmpty(key)) {
      clog.debug('store.get error: a key is expect')
      return
    }
    key = key.trim()
    clog.debug('get value for', key)
    let keypath = path.join(fpath.store, key)
    if (!fs.existsSync(keypath)) {
      clog.debug(key, 'not set yet')
      return
    }
    let keystat = fs.statSync(keypath)
    if (keystat.isDirectory()) {
      return key + ' is a folder'
    }
    if (keystat.size > this.maxByte) {
      return 'the size of ' + key + ' is ' + keystat.size + ', over limit ' + this.maxByte
    }
    let value = fs.readFileSync(keypath, 'utf8')
    if (type === 'raw') {
      return value
    }
    let objv = sJson(value)
    if (objv && objv.value !== undefined && /^(number|boolean|object|string|array)$/.test(objv.type)) {
      value = objv.value
    }
    if (type === undefined) {
      return value
    }
    switch (type) {
      case 'boolean':
        return sBool(value)
      case 'number':
        return Number(value)
      case 'array':
      case 'object':
      case 'json':
      case 'dict':
        return sJson(value, true)
      case 'string':
        return sString(value)
      case 'r':
      case 'random':
        switch (sType(value)) {
          case 'array':
            return value[iRandom(0, value.length-1)]
          case 'object':
            const keys = Object.keys(value)
            return value[keys[iRandom(0, keys.length-1)]]
          case 'number':
            return iRandom(value)
          case 'boolean':
            return Boolean(iRandom(0,1))
          default: {
            const strList = value.split(/\r\n|\r|\n/)
            return strList[iRandom(0, strList.length-1)]
          }
        }
      default:{
        clog.error('unknow store.get type', type, 'return original value')
        return value
      }
    }
  },
  put(value, key, options = {}) {
    if (bEmpty(key) || value === undefined) {
      clog.error('store put error: no key or value')
      return false
    }
    if (key.length > 64) {
      clog.error('store put key: ' + key + ' is longer than 64, maybe put key and value in wrong order. store.put(value, key)')
      return false
    }
    clog.debug('put value to', key)
    if (value === '') {
      return this.delete(key)
    }
    let type = ''
    if (typeof options === 'string') {
      type = options
    } else {
      type = options && options.type
    }
    if (type === 'a') {
      let oldval = this.get(key)
      if (oldval !== undefined) {
        if (typeof oldval === 'string') {
          value = oldval + '\n' + sString(value)
        } else if (Array.isArray(oldval)) {
          value = Array.isArray(value) ? [...oldval, ...value] : [...oldval, value]
        } else if (sType(oldval) === 'object') {
          value = Object.assign(oldval, sJson(value, true))
        } else if (typeof oldval === 'number') {
          value = oldval + Number(value)
        }
      }
      type = sType(value)
    } else if (type === 'number') {
      value = Number(value)
    } else if (type === 'boolean') {
      value = sBool(value)
    } else if (type === 'object' || type === 'array') {
      value = sJson(value, true)
    } else if (type === 'string') {
      value = sString(value)
    } else {
      type = sType(value)
    }
    if (!/^(number|boolean|object|array)$/.test(type)) {
      type = 'string'
      value = String(value)
    }
    value = JSON.stringify({
      type, value, note: options.note, belong: options.belong, update: options.update || now(null, false)
    })
    if (Buffer.byteLength(value, 'utf8') > this.maxByte) {
      clog.error('store put error, data length is over limit', this.maxByte)
      return false
    }
    fs.writeFileSync(path.join(fpath.store, key), value, 'utf8')
    return true
  },
  delete(key) {
    if (bEmpty(key)) {
      clog.debug('store.delete first parameter is expect')
      return false
    }
    clog.debug('delete store key:', key)
    let spath = path.join(fpath.store, key)
    if (fs.existsSync(spath)) {
      fs.unlinkSync(spath)
      return true
    }
    clog.info('store key', key, 'no exist')
    return false
  },
  all() {
    return fs.readdirSync(fpath.store)
  }
}

module.exports = { list, Jsfile, store, file }