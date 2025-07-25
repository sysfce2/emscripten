/**
 * @license
 * Copyright 2018 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

addToLibrary({
  $NODERAWFS__deps: ['$ERRNO_CODES', '$FS', '$NODEFS', '$mmapAlloc', '$FS_modeStringToFlags'],
  $NODERAWFS__postset: `
    if (!ENVIRONMENT_IS_NODE) {
      throw new Error("NODERAWFS is currently only supported on Node.js environment.")
    }
    var _wrapNodeError = function(func) {
      return function(...args) {
        try {
          return func(...args)
        } catch (e) {
          if (e.code) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          throw e;
        }
      }
    };
    // Use this to reference our in-memory filesystem
    /** @suppress {partialAlias} */
    var VFS = {...FS};
    // Wrap the whole in-memory filesystem API with
    // our Node.js based functions
    for (var _key in NODERAWFS) {
      FS[_key] = _wrapNodeError(NODERAWFS[_key]);
    }`,
  $NODERAWFS: {
    lookup(parent, name) {
#if ASSERTIONS
      assert(parent)
      assert(parent.path)
#endif
      return FS.lookupPath(`${parent.path}/${name}`).node;
    },
    lookupPath(path, opts = {}) {
      if (opts.parent) {
        path = PATH.dirname(path);
      }
      var st = fs.lstatSync(path);
      var mode = NODEFS.getMode(path);
      return { path, node: { id: st.ino, mode, node_ops: NODERAWFS, path }};
    },
    createStandardStreams() {
      // FIXME: tty is set to true to appease isatty(), the underlying ioctl syscalls still needs to be implemented, see issue #22264.
      FS.createStream({ nfd: 0, position: 0, path: '/dev/stdin', flags: 0, tty: true, seekable: false }, 0);
      var paths = [,'/dev/stdout', '/dev/stderr'];
      for (var i = 1; i < 3; i++) {
        FS.createStream({ nfd: i, position: 0, path: paths[i], flags: {{{ cDefs.O_TRUNC | cDefs.O_CREAT | cDefs.O_WRONLY }}}, tty: true, seekable: false }, i);
      }
    },
    // generic function for all node creation
    cwd() { return process.cwd(); },
    chdir(...args) { process.chdir(...args); },
    mknod(path, mode) {
      if (FS.isDir(path)) {
        fs.mkdirSync(path, mode);
      } else {
        fs.writeFileSync(path, '', { mode: mode });
      }
    },
    mkdir(...args) { fs.mkdirSync(...args); },
    symlink(...args) { fs.symlinkSync(...args); },
    rename(...args) { fs.renameSync(...args); },
    rmdir(...args) { fs.rmdirSync(...args); },
    readdir(...args) { return ['.', '..'].concat(fs.readdirSync(...args)); },
    unlink(...args) { fs.unlinkSync(...args); },
    readlink(...args) { return fs.readlinkSync(...args); },
    stat(path, dontFollow) {
      var stat = dontFollow ? fs.lstatSync(path) : fs.statSync(path);
      if (NODEFS.isWindows) {
        // Windows does not report the 'x' permission bit, so propagate read
        // bits to execute bits.
        stat.mode |= (stat.mode & {{{ cDefs.S_IRUGO }}}) >> 2;
      }
      return stat;
    },
    fstat(fd) {
      var stream = FS.getStreamChecked(fd);
      return fs.fstatSync(stream.nfd);
    },
    statfs(path) {
      // Node's fs.statfsSync API doesn't provide these attributes so include
      // some defaults.
      var defaults = {
        fsid: 42,
        flags: 2,
        namelen: 255,
      }
      return Object.assign(defaults, fs.statfsSync(path));
    },
    statfsStream(stream) {
      return FS.statfs(stream.path);
    },
    chmod(path, mode, dontFollow) {
      mode &= {{{ cDefs.S_IALLUGO }}};
      if (NODEFS.isWindows) {
        // Windows only supports S_IREAD / S_IWRITE (S_IRUSR / S_IWUSR)
        // https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/chmod-wchmod
        mode &= {{{ cDefs.S_IRUSR | cDefs.S_IWUSR }}};
      }
      if (dontFollow && fs.lstatSync(path).isSymbolicLink()) {
        // Node (and indeed linux) does not support chmod on symlinks
        // https://nodejs.org/api/fs.html#fslchmodsyncpath-mode
        throw new FS.ErrnoError({{{ cDefs.EOPNOTSUPP }}});
      }
      fs.chmodSync(path, mode);
    },
    fchmod(fd, mode) {
      var stream = FS.getStreamChecked(fd);
      fs.fchmodSync(stream.nfd, mode);
    },
    chown(...args) { fs.chownSync(...args); },
    fchown(fd, owner, group) {
      var stream = FS.getStreamChecked(fd);
      fs.fchownSync(stream.nfd, owner, group);
    },
    truncate(path, len) {
      // See https://github.com/nodejs/node/issues/35632
      if (len < 0) {
        throw new FS.ErrnoError({{{ cDefs.EINVAL }}});
      }
      return fs.truncateSync(path, len);
    },
    ftruncate(fd, len) {
      // See https://github.com/nodejs/node/issues/35632
      if (len < 0) {
        throw new FS.ErrnoError({{{ cDefs.EINVAL }}});
      }
      var stream = FS.getStreamChecked(fd);
      fs.ftruncateSync(stream.nfd, len);
    },
    utime(path, atime, mtime) {
      // null here for atime or mtime means UTIME_OMIT was passed.  Since node
      // doesn't support this concept we need to first find the existing
      // timestamps in order to preserve them.
      if ((atime === null) || (mtime === null)) {
        var st = fs.statSync(path);
        atime ||= st.atimeMs;
        mtime ||= st.mtimeMs;
      }
      fs.utimesSync(path, atime/1000, mtime/1000);
    },
    open(path, flags, mode) {
      if (typeof flags == "string") {
        flags = FS_modeStringToFlags(flags)
      }
      var pathTruncated = path.split('/').map((s) => s.slice(0, 255)).join('/');
      var nfd = fs.openSync(pathTruncated, NODEFS.flagsForNode(flags), mode);
      var st = fs.fstatSync(nfd);
      if (flags & {{{ cDefs.O_DIRECTORY }}} && !st.isDirectory()) {
        fs.closeSync(nfd);
        throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
      }
      var newMode = NODEFS.getMode(pathTruncated);
      var node = { id: st.ino, mode: newMode, node_ops: NODERAWFS, path }
      return FS.createStream({ nfd, position: 0, path, flags, node, seekable: true });
    },
    createStream(stream, fd) {
      // Call the original FS.createStream
      var rtn = VFS.createStream(stream, fd);
      if (typeof rtn.shared.refcnt == 'undefined') {
        rtn.shared.refcnt = 1;
      } else {
        rtn.shared.refcnt++;
      }
      return rtn;
    },
    close(stream) {
      VFS.closeStream(stream.fd);
      // Don't close stdin/stdout/stderr since they are used by node itself.
      if (!stream.stream_ops && --stream.shared.refcnt <= 0 && stream.nfd > 2) {
        // This stream is created by our Node.js filesystem, close the
        // native file descriptor when its reference count drops to 0.
        fs.closeSync(stream.nfd);
      }
    },
    llseek(stream, offset, whence) {
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.llseek(stream, offset, whence);
      }
      var position = offset;
      if (whence === {{{ cDefs.SEEK_CUR }}}) {
        position += stream.position;
      } else if (whence === {{{ cDefs.SEEK_END }}}) {
        position += fs.fstatSync(stream.nfd).size;
      } else if (whence !== {{{ cDefs.SEEK_SET }}}) {
        throw new FS.ErrnoError({{{ cDefs.EINVAL }}});
      }

      if (position < 0) {
        throw new FS.ErrnoError({{{ cDefs.EINVAL }}});
      }
      stream.position = position;
      return position;
    },
    read(stream, buffer, offset, length, position) {
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.read(stream, buffer, offset, length, position);
      }
      var seeking = typeof position != 'undefined';
      if (!seeking && stream.seekable) position = stream.position;
      var bytesRead = fs.readSync(stream.nfd, new Int8Array(buffer.buffer, offset, length), 0, length, position);
      // update position marker when non-seeking
      if (!seeking) stream.position += bytesRead;
      return bytesRead;
    },
    write(stream, buffer, offset, length, position) {
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.write(stream, buffer, offset, length, position);
      }
      if (stream.flags & +"{{{ cDefs.O_APPEND }}}") {
        // seek to the end before writing in append mode
        FS.llseek(stream, 0, +"{{{ cDefs.SEEK_END }}}");
      }
      var seeking = typeof position != 'undefined';
      if (!seeking && stream.seekable) position = stream.position;
      var bytesWritten = fs.writeSync(stream.nfd, new Int8Array(buffer.buffer, offset, length), 0, length, position);
      // update position marker when non-seeking
      if (!seeking) stream.position += bytesWritten;
      return bytesWritten;
    },
    mmap(stream, length, position, prot, flags) {
      if (!length) {
        throw new FS.ErrnoError({{{ cDefs.EINVAL }}});
      }
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.mmap(stream, length, position, prot, flags);
      }

      var ptr = mmapAlloc(length);
      FS.read(stream, HEAP8, ptr, length, position);
      return { ptr, allocated: true };
    },
    msync(stream, buffer, offset, length, mmapFlags) {
      if (stream.stream_ops) {
        // this stream is created by in-memory filesystem
        return VFS.msync(stream, buffer, offset, length, mmapFlags);
      }

      FS.write(stream, buffer, 0, length, offset);
      // should we check if bytesWritten and length are the same?
      return 0;
    },
    ioctl() {
      throw new FS.ErrnoError({{{ cDefs.ENOTTY }}});
    }
  }
});
