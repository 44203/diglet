'use strict';

const { ipcRenderer, remote } = require('electron');
const { shell, app, dialog } = remote;

const async = require('async');
const { randomBytes } = require('crypto');
const config = require('../bin/_config');
const bunyan = require('bunyan');
const httpServer = require('http-server');
const { Tunnel } = require('../lib');
const Vue = require('vue/dist/vue');


const tunnel = Vue.component('tunnel', {
  data: function() {
    return {
      isShutdown: false,
      loading: false,
      tunnelEstablished: false,
      tunnelUrls: [],
      error: '',
      localServerPort: 0,
    };
  },
  methods: {
    setupWebServer: function(cb) {
      this.server = httpServer.createServer({
        root: this.rootdir
      });

      this.server.listen(0, () => {
        this.localServerPort = this.server.server.address().port;
        cb && cb();
      });
    },
    establishTunnel: function(cb) {
      this.tunnelUrls = [];
      this.logger = bunyan.createLogger({ name: 'digletapp' });
      this.tunnel = new Tunnel({
        localAddress: '127.0.0.1',
        localPort: this.localServerPort,
        remoteAddress: config.Hostname,
        remotePort: parseInt(config.TunnelPort),
        logger: this.logger,
        privateKey: randomBytes(32),
      });

      this.tunnel.once('connected', () => {
        this.tunnelUrls.push(this.tunnel.url);
        this.tunnel.queryProxyInfoFromServer({ rejectUnauthorized: false })
          .then(info => {
            this.tunnelUrls.push(this.tunnel.aliasUrl(info.alias));
            cb && cb();
          })
          .catch(cb);
      });

      this.tunnel.once('error', e => {
        this.error = e.message;
      });

      this.tunnel.open();
    },
    init: function() {
      this.loading = true;
      async.series([
        (cb) => this.setupWebServer(cb),
        (cb) => this.establishTunnel(cb)
      ], err => {
        this.loading = false;
        this.error = err ? err.message : '';
        this.tunnelEstablished = !!err;
      });
    },
    openLink: function(url) {
      shell.openExternal(url);
    },
    shutdown: function() {
      this.server.server.close();
      this.tunnel.close();
      this.isShutdown = true;
    }
  },
  props: {
    rootdir: {
      type: String,
      default: ''
    }
  },
  mounted: function() {
    this.init();
  },
  template: `
    <div class="tunnel" v-if="!isShutdown">
      <ul>
        <li>
          <img class="left status" src="assets/vendor/adwaita-scalable/status/network-error-symbolic.svg" v-if="error">
          <img class="left status" src="assets/vendor/adwaita-scalable/status/network-no-route-symbolic.svg" v-if="!error && loading">
          <img class="left status" src="assets/vendor/adwaita-scalable/status/network-transmit-receive-symbolic.svg" v-if="!error && !loading">
        </li>
        <li>
          <ul>
            <li><i class="fas fa-folder"></i> {{rootdir}}</li>
            <li v-for="url in tunnelUrls"><i class="fas fa-link"></i> <a href="#" v-on:click="openLink(url)">{{url}}</a></li>
          </ul>
        </li>
        <li class="right">
          <button class="action right" v-on:click="shutdown"><img src="assets/vendor/adwaita-scalable/actions/edit-delete-symbolic.svg"></button>
        </li>
      </ul>
    </div>
  `
});

const diglet = new Vue({
  el: '#app',
  data: {
    tunnels: [
      {
        rootdir: '/home/em/Public',
      },
      {
        rootdir: '/home/em/Public',
      },
      {
        rootdir: '/home/em/Public',
      },
    ]
  },
  methods: {
    addFiles: function() {
      remote.dialog.showOpenDialog({
        title: 'Select Directory',
        buttonLabel: 'Establish Tunnel',
        properties: ['openDirectory']
      }).then(result => {
        if (result.filePaths.length) {
          this.tunnels.push({ rootdir: result.filePaths.join(',') });
        }
      });
    },
    closeWindow: function() {
      const win = remote.getCurrentWindow();

      if (!this.tunnels.length) {
        win.close();
      } else if (confirm('Shutdown active tunnels?')) {
        win.close();
      }
    },
    maxWindow: function() {
      const win = remote.getCurrentWindow();
      if (!win.isMaximized()) {
        win.maximize();
      } else {
        win.unmaximize();
      }
    },
    minWindow: function() {
      const win = remote.getCurrentWindow();
      win.minimize();
    }
  },
  mounted: function() {
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    });
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }
});
