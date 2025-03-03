(function(w) {
    if (w.fastXDM) return;
  
    var handlers  = {};
    var proxyToServer = {};
    var onEnvLoad = [];
    var env       = {};
  
    // Key generation
    function genKey() {
      var key = '';
      for (var i = 0; i < 5; i++) {
        key += Math.ceil(Math.random() * 15).toString(16);
      }
      return key;
    }
  
    function waitFor(obj, prop, func, self,  count) {
      if (obj[prop]) {
        func.apply(self);
      } else {
        count = count || 0;
        if (count < 1000) {
          setTimeout(function() {
            waitFor(obj, prop, func, self, count + 1);
          }, 0);
        }
      }
    }
  
    function attachScript(url) {
      setTimeout(function() {
        var newScript  = document.createElement('script');
        newScript.type = 'text/javascript';
        newScript.src  = url || w.fastXDM.helperUrl;
        waitFor(document, 'body', function() {
          document.getElementsByTagName('HEAD')[0].appendChild(newScript);
        });
      }, 0);
    }
  
    function walkVar(value, clean) {
      var newValue;
  
      switch (typeof value) {
        case 'string':
          if (clean) {
            newValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
          } else {
            newValue = value.replace(/&#039;/g, '\'').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
          }
          break;
        case 'object':
          if (Object.prototype.toString.apply(value) === '[object Array]') {
            newValue = [];
            for (var i = 0, len = value.length; i < len; i++) {
              newValue[i] = walkVar(value[i], clean);
            }
          } else {
            newValue = {};
            for (var k in value) {
              if (Object.hasOwnProperty.call(value, k)) {
                newValue[k] = walkVar(value[k], clean);
              }
            }
          }
          break;
        default:
          newValue = value;
          break;
      }
  
      return newValue;
    }
  
    // Env functions
    function getEnv(callback, self) {
      if (env.loaded) {
        callback.apply(self, [env]);
      } else {
        onEnvLoad.push([self, callback]);
      }
    }
  
    function envLoaded() {
      env.loaded = true;
  
      for (var i = 0, len = onEnvLoad.length; i < len; i++) {
        onEnvLoad[i][1].apply(onEnvLoad[i][0], [env]);
      }
    }
  
    function applyMethod(strData, self, origin) {
      getEnv(function(env) {
        var data = env.json.parse(strData);
        var method = data[0];
  
        if (method) {
          if (
            env.protocol === 'p' &&
            self.options.sameOrigin &&
            origin !== w.origin &&
            !self.isUnsafeMethod(method)
          ) {
            throw Error('Insecure method call.');
          }
  
          if (!data[1]) data[1] = [];
  
          for (var i = 0, len = data[1].length; i < len; i++) {
            if (data[1][i] && data[1][i]._func) {
              var funcNum = data[1][i]._func;
              data[1][i] = function() {
                var args = Array.prototype.slice.call(arguments);
                args.unshift('_func' + funcNum);
                self.callMethod.apply(self, args);
              }
            } else if (self.options.safe) {
              data[1][i] = walkVar(data[1][i], true);
            }
          }
  
          setTimeout(function() {
            if (!self.methods[method]) {
              throw Error('fastXDM: Method ' + method + ' is undefined');
            }
            self.methods[method].apply(self, data[1]);
          }, 0);
        }
      });
    }
  
    function extend(obj1, obj2) {
      for (var i in obj2) {
        if (obj1[i] && typeof(obj1[i]) === 'object') {
          extend(obj1[i], obj2[i])
        } else {
          obj1[i] = obj2[i];
        }
      }
    }
  
    // XDM object
    w.fastXDM = {
      _id: 0,
      helperUrl: 'https://vk.com/js/api/xdmHelper.js',
  
      Server: function(methods, filter, options) {
        this.methods   = methods || {};
        this.filter    = filter;
        this.options   = options || {};
        this.id        = w.fastXDM._id++;
        this.key       = genKey();
        this.frameName = 'fXD' + this.key;
        this.server    = true;
  
        this.methods['%init%'] = this.methods.__fxdm_i = function() {
          getEnv(function(env) {
            for (var method in this.methods) {
              if (this.methods[method] instanceof w.fastXDM.Server) {
                var proxyFromServer = this;
                var proxyToServer = this.methods[method];
  
                if (env.protocol === 'p') {
                  env.send(proxyFromServer, env.json.stringify(['%proxy%', [method, proxyToServer.key]]));
                }
  
                this.methods[method] = function() {
                  this.callMethod.apply(this, arguments);
                }.bind(proxyToServer)
              }
            }
          }, this);
  
          w.fastXDM.run(this.id);
          if (this.methods.onInit) {
            this.methods.onInit();
          }
        };
  
        handlers[this.key] = [applyMethod, this];
      },
  
      Client: function(methods, options) {
        this.methods = methods || {};
        this.options = options || {};
        this.id      = w.fastXDM._id++;
        this.client  = true;
  
        w.fastXDM.run(this.id);
  
        if (window.name.indexOf('fXD') === 0) {
          this.key = window.name.substr(3);
        } else {
          throw Error('Wrong window.name property.');
        }
  
        this.caller = window.parent;
  
        if (!proxyToServer[this.key]) {
          proxyToServer[this.key] = {};
        }
        this.methods['%proxy%'] = function(method, key) {
          if (method && key && this.caller.frames['fXD' + key]) {
            proxyToServer[this.key][method] = {
              key: key,
              frame: {
                contentWindow: this.caller.frames['fXD' + key]
              }
            };
          }
        }.bind(this);
  
        handlers[this.key] = [applyMethod, this];
  
        w.fastXDM.on('helper', function() {
          w.fastXDM.onClientStart(this);
        }, this);
  
        getEnv(function(env) {
          env.send(this, env.json.stringify(['%init%']));
  
          var methods = this.methods;
          setTimeout(function() {
            if (methods.onInit) {
              methods.onInit();
            }
          }, 0);
        }, this);
      },
  
      onMessage: function(e) {
        var data = e.data;
        if (!data) {
          return false;
        }
        if (typeof data !== 'string' && !(data instanceof String)) {
          return false;
        }
  
        var key = data.substr(0, 5);
        if (handlers[key]) {
          var self = handlers[key][1];
          if (self && (!self.filter || self.filter(e.origin))) {
            handlers[key][0](data.substr(6), self, e.origin);
          }
        }
      },
  
      setJSON: function(json) {
        env.json = json;
      },
  
      getJSON: function(callback) {
        if (!callback) {
          return env.json;
        }
  
        getEnv(function(env) {
          callback(env.json);
        });
      },
  
      getProxyToServer: function(key, method) {
        return proxyToServer[key] && proxyToServer[key][method];
      },
  
      setEnv: function(exEnv) {
        for (var i in exEnv) {
          env[i] = exEnv[i];
        }
  
        envLoaded();
      },
  
      _q: {},
  
      on: function(key, act, self) {
        if (!this._q[key]) this._q[key] = [];
  
        if (this._q[key] == -1) {
          act.apply(self);
        } else {
          this._q[key].push([act, self]);
        }
      },
  
      run: function(key) {
        var len = (this._q[key] || []).length;
        for (var i = 0; i < len; i++) {
          this._q[key][i][0].apply(this._q[key][i][1]);
        }
  
        this._q[key] = -1;
      },
  
      waitFor: waitFor
    }
  
    w.fastXDM.Server.prototype.start = function(obj, count) {
      if (obj.contentWindow) {
        this.caller = obj.contentWindow;
        this.frame  = obj;
  
        w.fastXDM.on('helper', function() {
          w.fastXDM.onServerStart(this);
        }, this);
      } else { // Opera old versions
        var self = this;
        count = count || 0;
        if (count < 50) {
          setTimeout(function() {
            self.start.apply(self, [obj, count + 1]);
          }, 100);
        }
      }
    }
  
    w.fastXDM.Server.prototype.destroy = function() {
      delete handlers[this.key];
    }
  
    w.fastXDM.Server.prototype.append = function(obj, options, attrs) {
      var div       = document.createElement('DIV');
      div.innerHTML = '<iframe name="' + this.frameName + '" ' + (attrs || '') + '></iframe>';
      var frame     = div.firstChild;
      var self      = this;
  
      setTimeout(function() {
        frame.frameBorder = '0';
        if (options) extend(frame, options);
        obj.insertBefore(frame, obj.firstChild);
        self.start(frame);
      }, 0);
  
      return frame;
    }
  
    w.fastXDM.Client.prototype.callMethod = w.fastXDM.Server.prototype.callMethod = function() {
      var args   = Array.prototype.slice.call(arguments);
      var method = args.shift();
  
      for (var i = 0, len = args.length; i < len; i++) {
        if (typeof(args[i]) === 'function') {
          this.funcsCount = (this.funcsCount || 0) + 1;
          var func        = args[i];
          var funcName    = '_func' + this.funcsCount;
  
          this.methods[funcName] = function() {
            func.apply(this, arguments);
            delete this.methods[funcName];
          }
  
          args[i] = {_func: this.funcsCount};
        } else if (this.options.safe) {
          args[i] = walkVar(args[i], false);
        }
      }
  
      waitFor(this, 'caller', function() {
        w.fastXDM.on(this.id, function() {
          getEnv(function(env) {
            var xdm = this;
            var proxyToServer = w.fastXDM.getProxyToServer(this.key, method);
  
            if (proxyToServer) {
              xdm = proxyToServer;
              method = args.shift();
            }
  
            env.send(xdm, env.json.stringify([method, args]));
          }, this);
        }, this);
      }, this);
    }
  
    w.fastXDM.Client.prototype.isUnsafeMethod = w.fastXDM.Server.prototype.isUnsafeMethod = function(method) {
      return ~['%proxy%', '%init%'].indexOf(method) || this.options.unsafeMethods && ~this.options.unsafeMethods.indexOf(method);
    }
  
    if (w.JSON && typeof(w.JSON) === 'object' && w.JSON.parse && w.JSON.stringify && w.JSON.stringify({a:[1,2,3]}).replace(/ /g, '') === '{"a":[1,2,3]}') {
      env.json = {parse: w.JSON.parse, stringify: w.JSON.stringify};
    } else {
      w.fastXDM._needJSON = true;
    }
  
    // PostMessage cover
    if (w.postMessage) {
      env.protocol = 'p';
      env.send = function(xdm, strData) {
        var win = (xdm.frame ? xdm.frame.contentWindow : xdm.caller);
        if (win) {
          try {
            win.postMessage(xdm.key + ':' + strData, "*");
          } catch(e) {
            window.postMessage.call(win, xdm.key + ':' + strData, "*");
          }
        }
      }
  
      if (w.addEventListener) {
        w.addEventListener("message", w.fastXDM.onMessage, false);
      } else {
        w.attachEvent("onmessage", w.fastXDM.onMessage);
      }
  
      if (w.fastXDM._needJSON) {
        w.fastXDM._onlyJSON = true;
        attachScript();
      } else {
        envLoaded();
      }
    } else {
      attachScript();
    }
  })(window);
  
  if (!window.VK) window.VK = {};
  
  /*
   * Based on JavaScript implementation of the RSA Data Security, Inc. MD5 Message
   * Copyright (C) Paul Johnston 1999 - 2009
   * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
   * Distributed under the BSD License
   */
  if(!VK.MD5){VK.MD5=function(n){var j=function(o,r){var q=(o&65535)+(r&65535),p=(o>>16)+(r>>16)+(q>>16);return(p<<16)|(q&65535)},g=function(o,p){return(o<<p)|(o>>>(32-p))},k=function(w,r,p,o,v,u){return j(g(j(j(r,w),j(o,u)),v),p)},a=function(q,p,w,v,o,u,r){return k((p&w)|((~p)&v),q,p,o,u,r)},h=function(q,p,w,v,o,u,r){return k((p&v)|(w&(~v)),q,p,o,u,r)},c=function(q,p,w,v,o,u,r){return k(p^w^v,q,p,o,u,r)},m=function(q,p,w,v,o,u,r){return k(w^(p|(~v)),q,p,o,u,r)},b=function(A,u){var z=1732584193,y=-271733879,w=-1732584194,v=271733878,r,q,p,o;A[u>>5]|=128<<((u)%32);A[(((u+64)>>>9)<<4)+14]=u;for(var t=0,s=A.length;t<s;t+=16){r=z;q=y;p=w;o=v;z=a(z,y,w,v,A[t+0],7,-680876936);v=a(v,z,y,w,A[t+1],12,-389564586);w=a(w,v,z,y,A[t+2],17,606105819);y=a(y,w,v,z,A[t+3],22,-1044525330);z=a(z,y,w,v,A[t+4],7,-176418897);v=a(v,z,y,w,A[t+5],12,1200080426);w=a(w,v,z,y,A[t+6],17,-1473231341);y=a(y,w,v,z,A[t+7],22,-45705983);z=a(z,y,w,v,A[t+8],7,1770035416);v=a(v,z,y,w,A[t+9],12,-1958414417);w=a(w,v,z,y,A[t+10],17,-42063);y=a(y,w,v,z,A[t+11],22,-1990404162);z=a(z,y,w,v,A[t+12],7,1804603682);v=a(v,z,y,w,A[t+13],12,-40341101);w=a(w,v,z,y,A[t+14],17,-1502002290);y=a(y,w,v,z,A[t+15],22,1236535329);z=h(z,y,w,v,A[t+1],5,-165796510);v=h(v,z,y,w,A[t+6],9,-1069501632);w=h(w,v,z,y,A[t+11],14,643717713);y=h(y,w,v,z,A[t+0],20,-373897302);z=h(z,y,w,v,A[t+5],5,-701558691);v=h(v,z,y,w,A[t+10],9,38016083);w=h(w,v,z,y,A[t+15],14,-660478335);y=h(y,w,v,z,A[t+4],20,-405537848);z=h(z,y,w,v,A[t+9],5,568446438);v=h(v,z,y,w,A[t+14],9,-1019803690);w=h(w,v,z,y,A[t+3],14,-187363961);y=h(y,w,v,z,A[t+8],20,1163531501);z=h(z,y,w,v,A[t+13],5,-1444681467);v=h(v,z,y,w,A[t+2],9,-51403784);w=h(w,v,z,y,A[t+7],14,1735328473);y=h(y,w,v,z,A[t+12],20,-1926607734);z=c(z,y,w,v,A[t+5],4,-378558);v=c(v,z,y,w,A[t+8],11,-2022574463);w=c(w,v,z,y,A[t+11],16,1839030562);y=c(y,w,v,z,A[t+14],23,-35309556);z=c(z,y,w,v,A[t+1],4,-1530992060);v=c(v,z,y,w,A[t+4],11,1272893353);w=c(w,v,z,y,A[t+7],16,-155497632);y=c(y,w,v,z,A[t+10],23,-1094730640);z=c(z,y,w,v,A[t+13],4,681279174);v=c(v,z,y,w,A[t+0],11,-358537222);w=c(w,v,z,y,A[t+3],16,-722521979);y=c(y,w,v,z,A[t+6],23,76029189);z=c(z,y,w,v,A[t+9],4,-640364487);v=c(v,z,y,w,A[t+12],11,-421815835);w=c(w,v,z,y,A[t+15],16,530742520);y=c(y,w,v,z,A[t+2],23,-995338651);z=m(z,y,w,v,A[t+0],6,-198630844);v=m(v,z,y,w,A[t+7],10,1126891415);w=m(w,v,z,y,A[t+14],15,-1416354905);y=m(y,w,v,z,A[t+5],21,-57434055);z=m(z,y,w,v,A[t+12],6,1700485571);v=m(v,z,y,w,A[t+3],10,-1894986606);w=m(w,v,z,y,A[t+10],15,-1051523);y=m(y,w,v,z,A[t+1],21,-2054922799);z=m(z,y,w,v,A[t+8],6,1873313359);v=m(v,z,y,w,A[t+15],10,-30611744);w=m(w,v,z,y,A[t+6],15,-1560198380);y=m(y,w,v,z,A[t+13],21,1309151649);z=m(z,y,w,v,A[t+4],6,-145523070);v=m(v,z,y,w,A[t+11],10,-1120210379);w=m(w,v,z,y,A[t+2],15,718787259);y=m(y,w,v,z,A[t+9],21,-343485551);z=j(z,r);y=j(y,q);w=j(w,p);v=j(v,o)}return[z,y,w,v]},f=function(r){var q="",s=-1,p=r.length,o,t;while(++s<p){o=r.charCodeAt(s);t=s+1<p?r.charCodeAt(s+1):0;if(55296<=o&&o<=56319&&56320<=t&&t<=57343){o=65536+((o&1023)<<10)+(t&1023);s++}if(o<=127){q+=String.fromCharCode(o)}else{if(o<=2047){q+=String.fromCharCode(192|((o>>>6)&31),128|(o&63))}else{if(o<=65535){q+=String.fromCharCode(224|((o>>>12)&15),128|((o>>>6)&63),128|(o&63))}else{if(o<=2097151){q+=String.fromCharCode(240|((o>>>18)&7),128|((o>>>12)&63),128|((o>>>6)&63),128|(o&63))}}}}}return q},e=function(p){var o=Array(p.length>>2),r,q;for(r=0,q=o.length;r<q;r++){o[r]=0}for(r=0,q=p.length*8;r<q;r+=8){o[r>>5]|=(p.charCodeAt(r/8)&255)<<(r%32)}return o},l=function(p){var o="";for(var r=0,q=p.length*32;r<q;r+=8){o+=String.fromCharCode((p[r>>5]>>>(r%32))&255)}return o},d=function(o){return l(b(e(o),o.length*8))},i=function(q){var t="0123456789abcdef",p="",o;for(var s=0,r=q.length;s<r;s++){o=q.charCodeAt(s);p+=t.charAt((o>>>4)&15)+t.charAt(o&15)}return p};return i(d(f(n)))}}
  
  /*
   * VKontakte Open API JavaScript library
   * http://vk.com/
   */
  
  VK.extend = function(target, source, overwrite) {
    for (var key in source) {
      if (overwrite || typeof target[key] === 'undefined') {
        target[key] = source[key];
      }
    }
    return target;
  };
  
  VK.extend(VK, {
    _domain: {
      base: 'https://vk.com',
      login: 'https://login.vk.com',
      main: 'https://oauth.vk.com',
      api: 'https://api.vk.com'
    }
  }, true);
  
  if (!VK.xdConnectionCallbacks) {
  
    VK.extend(VK, {
      version: 1,
      _apiId: null,
      _session: null,
      _userStatus: 'unknown',
      _path: {
        login: 'authorize',
        proxy: 'fxdm_oauth_proxy.html'
      },
      _rootId: 'vk_api_transport',
      _nameTransportPath: '',
      xdReady: false,
      access: {
        FRIENDS:   0x2,
        PHOTOS:    0x4,
        AUDIO:     0x8,
        VIDEO:     0x10,
        MATCHES:   0x20,
        QUESTIONS: 0x40,
        WIKI:      0x80
      }
    });
  
    VK.init = function(options) {
      var body, root;
  
      VK._apiId = null;
      if (!options.apiId) {
        throw Error('VK.init() called without an apiId');
      }
      VK._apiId = options.apiId;
  
      if (options.onlyWidgets) return true;
  
      if (options.nameTransportPath && options.nameTransportPath !== '') {
        VK._nameTransportPath = options.nameTransportPath;
      }
  
      root = document.getElementById(VK._rootId);
      if (!root) {
        root = document.createElement('div');
        root.id = VK._rootId;
        body = document.getElementsByTagName('body')[0];
        body.insertBefore(root, body.childNodes[0]);
      }
      root.style.position = 'absolute';
      root.style.top = '-10000px';
  
      var session = VK.Cookie.load();
      if (session) {
        VK.Auth._loadState = 'loaded';
        VK.Auth.setSession(session, session ? 'connected' : 'unknown');
      }
    };
  
    if (!VK.Cookie) {
      VK.Cookie = {
        _domain: null,
        load: function() {
          var cookie = document.cookie.match('\\bvk_app_' + VK._apiId + '=([^;]*)\\b')
          var session;
  
          if (cookie) {
            session = this.decode(cookie[1]);
            if (session.secret != 'oauth') {
              return false;
            }
            session.expire = parseInt(session.expire, 10);
            VK.Cookie._domain = '.' + window.location.hostname;
          }
  
          return session;
        },
        setRaw: function(val, ts, domain, time) {
          var rawCookie;
          rawCookie = 'vk_app_' + VK._apiId + '=' + val + '';
          var exp = time ? (new Date().getTime() + time * 1000) : ts * 1000;
          rawCookie += (val && ts === 0 ? '' : '; expires=' + new Date(exp).toGMTString());
          rawCookie += '; path=/';
          rawCookie += (domain ? '; domain=.' + domain : '');
          document.cookie = rawCookie;
  
          this._domain = domain;
        },
        set: function(session, resp) {
          if (session) {
            this.setRaw(this.encode(session), session.expire, window.location.hostname, (resp || {}).time);
          } else {
            this.clear();
          }
        },
        clear: function() {
          this.setRaw('', 0, this._domain, 0);
        },
        encode: function(params) {
          var
              pairs = [],
              key;
  
          for (key in params) {
            if (key != 'user') pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
          }
          pairs.sort();
  
          return pairs.join('&');
        },
        decode: function(str) {
          var
              params = {},
              parts = str.split('&'),
              i,
              pair;
  
          for (i=0; i < parts.length; i++) {
            pair = parts[i].split('=', 2);
            if (pair && pair[0]) {
              params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
            }
          }
  
          return params;
        }
      };
    }
  
    function obj2qs(obj) {
      if (!obj) return '';
      var qs = [];
      for (var k in obj) {
        if (obj.hasOwnProperty(k)) {
          qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k].toString() || ''));
        }
      }
      return qs.length ? '?' + qs.join('&') : '';
    }
  
    if (!VK.Api) {
      VK.Api = {
        _headId: null,
        _callbacks: {},
  
        ie6_7: function() {
          if (!VK.Api.ieTested) {
            VK.Api.isIE6_7 = navigator.userAgent.match(/MSIE [6|7]/i);
            VK.Api.ieTested = true;
          }
          return VK.Api.isIE6_7;
        },
  
        supportCORS: function() {
          var xhr = new XMLHttpRequest();
          if ("withCredentials" in xhr) {
            return true;
          }
  
          if (typeof XDomainRequest != "undefined") {
            return true;
          }
  
          return false;
        },
  
        makeRequest: function(url, cb) {
          var xhr = VK.Api.createRequest('GET', url);
          if (!xhr) {
            return false;
          }
  
          xhr.onload = function() {
            var text = xhr.responseText;
            if (xhr.status === 200) {
              cb(text);
            } else {
              try {
                console.error('Open api access error', xhr.response);
              } catch(e) {
                //nop
              }
            }
          };
  
          xhr.onerror = function() {
            try {
              console.error('Open api access error');
            } catch(e) {
              //nop
            }
          };
  
          xhr.send();
          return true;
        },
  
        createRequest: function(method, url) {
          var xhr = new XMLHttpRequest();
  
          if ("withCredentials" in xhr) {
            // XHR for Chrome/Firefox/Opera/Safari.
            xhr.open(method, url, true);
            xhr.withCredentials = true;
          } else if (typeof XDomainRequest != "undefined") {
            // XDomainRequest for IE.
            xhr = new XDomainRequest();
            xhr.open(method, url);
            xhr.withCredentials = true;
          } else {
            // CORS not supported.
            xhr = null;
          }
  
          return xhr;
        },
  
        attachScript: function(url) {
          if (!VK.Api._headId) VK.Api._headId = document.getElementsByTagName("head")[0];
          var newScript = document.createElement('script');
          newScript.type = 'text/javascript';
          newScript.setAttribute('encoding', 'UTF-8');
          newScript.src = url;
          VK.Api._headId.appendChild(newScript);
        },
  
        checkMethod: function(method, params, cb, queryTry) {
          var m = method.toLowerCase();
  
          if (m === 'wall.post') {
            var validAttacheRegexp = /(^https?:\/\/)|(^(poll|album|photo|video|doc|audio|page|note)-?\d+_-?\d+)$/,
                validAttachments = [],
                methodAccess,
                queryParams,
                query,
                timer;
  
            if (!params.v) {
              params.v = '5.95';
            }
  
            params.attachments = params.attachments || params.attachment || [];
            if (typeof params.attachments === 'string') {
              params.attachments = params.attachments.split(',')
            }
  
            for (var i = 0; i < params.attachments.length; i++) {
              var attach = params.attachments[i].trim();
              if (validAttacheRegexp.test(attach)) {
                validAttachments.push(attach);
              }
            }
  
            params.attachments = validAttachments.length ? validAttachments : '';
            methodAccess = '_' + (Math.random()).toString(16).substr(2);
            queryParams = {
              act: 'wall_post_box',
              method: m,
              widget: 4,
              aid: parseInt(VK._apiId, 10),
              text: params.message || '',
              method_access: methodAccess
            };
  
            queryParams = VK.extend(queryParams, params);
            queryParams.owner_id = parseInt(params.owner_id || 0, 10);
            queryParams.publish_date = params.publish_date || '';
            query = VK._domain.base + '/al_apps.php';
            query += obj2qs(queryParams);
  
            VK.UI.popup({
              url: query,
              width: 560,
              height: 304
            });
  
            timer = setInterval(function() {
              if (VK.UI.active.closed) {
                clearInterval(timer);
                params.method_access = methodAccess;
                VK.Api.call(method, params, cb, queryTry);
              }
            }, 500);
            return false;
          }
  
          if (m == 'messages.allowmessagesfromgroup') {
            methodAccess = '_' + (Math.random()).toString(16).substr(2);
            query = VK._domain.base + '/widget_allow_messages_from_community.php?act=allow_box&group_id=' + parseInt(params.group_id, 10) + '&app_id=' + parseInt(VK._apiId, 10) + '&method_access=' + methodAccess;
  
            VK.UI.popup({
              url: query,
              width: 560,
              height: 304
            });
  
            timer = setInterval(function () {
              if (VK.UI.active.closed) {
                clearInterval(timer);
                params.method_access = methodAccess;
                VK.Api.call(method, params, cb, queryTry);
              }
            }, 500);
  
            return false;
          }
  
          return true;
        },
  
        call: function(method, params, cb, queryTry) {
          var
              query = params || {},
              qs,
              responseCb;
  
          if (typeof query != 'object' || typeof cb != 'function') {
            return false;
          }
          if (!params.method_access && !params.method_force && !VK.Api.checkMethod(method, params, cb, queryTry)) {
            return;
          }
  
          if (!queryTry) queryTry = 0;
  
          if (VK.Auth._loadState != 'loaded') {
            var authFunc = function(result) {
              if (result && result.session) {
                VK.Observer.unsubscribe('auth.loginStatus', authFunc);
                VK.Api.call(method, params, cb);
              }
            };
            VK.Observer.subscribe('auth.loginStatus', authFunc);
            VK.Auth.getLoginStatus();
            return;
          }
  
          if (VK.Api.queryLength(query) < 1500 && !VK.Api.ie6_7()) {
            var useXDM = false;
            var rnd = parseInt(Math.random() * 10000000, 10);
            while (VK.Api._callbacks[rnd]) {
              rnd = parseInt(Math.random() * 10000000, 10)
            }
            query.callback = 'VK.Api._callbacks['+rnd+']';
          } else {
            var useXDM = true;
          }
  
          if (VK._session && VK._session.sid) {
            query.access_token = VK._session.sid;
          }
  
          qs = VK.Cookie.encode(query);
  
          responseCb = function(response) {
            if (response.error && (response.error.error_code == 3 || response.error.error_code == 4 || response.error.error_code == 5)) {
              if (queryTry > 3) return false;
              var repeatCall = function(resp) {
                VK.Observer.unsubscribe('auth.sessionChange', repeatCall);
                delete params.access_token;
                if (resp.session) VK.Api.call(method, params, cb, queryTry + 1);
              }
              VK.Observer.subscribe('auth.sessionChange', repeatCall);
              VK.Auth.getLoginStatus();
            } else {
              cb(response);
            }
            if (!useXDM) delete VK.Api._callbacks[rnd];
          };
  
          if (useXDM) {
            if (VK.xdReady) {
              VK.XDM.remote.callMethod('apiCall', method, qs, responseCb);
            } else {
              VK.Observer.subscribe('xdm.init', function() {
                VK.XDM.remote.callMethod('apiCall', method, qs, responseCb);
              });
              VK.XDM.init();
            }
          } else {
            VK.Api._callbacks[rnd] = responseCb;
            VK.Api.attachScript(VK._domain.api + '/method/' + method +'?' + qs);
          }
        },
  
        queryLength: function(query) {
          var len = 100, i; // sid + sig
          for (i in query) {
            len += i.length + encodeURIComponent(query[i]).length + 1;
          }
          return len;
        }
      };
  
  // Alias
      VK.api = function(method, params, cb) {VK.Api.call(method, params, cb);}
    };
  
    if (!VK.Auth) {
      VK.Auth = {
        popup: null,
        lsCb: {},
  
        setSession: function(session, status, settings, resp) {
          var
              login = !VK._session && session,
              logout = VK._session && !session,
              both = VK._session && session && VK._session.mid != session.mid,
              sessionChange = login || logout || (VK._session && session && VK._session.sid != session.sid),
              statusChange = status != VK._userStatus,
              response = {
                'session': session,
                'status': status,
                'settings': settings
              };
  
          VK._session = session;
  
          VK._userStatus = status;
  
          VK.Cookie.set(session, resp);
  
          if (sessionChange || statusChange || both) {
            setTimeout(function() {
              if (statusChange) {
                VK.Observer.publish('auth.statusChange', response);
              }
  
              if (logout || both) {
                VK.Observer.publish('auth.logout', response);
              }
  
              if (login || both) {
                VK.Observer.publish('auth.login', response);
              }
  
              if (sessionChange) {
                VK.Observer.publish('auth.sessionChange', response);
              }
            }, 0);
          }
  
          return response;
        },
  
        // Public VK.Auth methods
        login: function(cb, settings) {
          if (!VK._apiId) {
            return false;
          }
  
          var url = VK._domain.main + '/' + VK._path.login + '?client_id='+VK._apiId+'&display=popup&redirect_uri=close.html&response_type=token&openapi=1';
          if (settings && parseInt(settings, 10) > 0) {
            url += '&scope=' + settings;
          }
  
          VK.Observer.unsubscribe('auth.onLogin');
          VK.Observer.subscribe('auth.onLogin', cb);
  
          VK.UI.popup({
            width: 665,
            height: 370,
            url: url
          });
  
          var authCallback = function() {
            VK.Auth.getLoginStatus(function(resp) {
              VK.Observer.publish('auth.onLogin', resp);
              VK.Observer.unsubscribe('auth.onLogin');
            }, true);
          }
  
          VK.UI.popupOpened = true;
          var popupCheck = function() {
            if (!VK.UI.popupOpened) {
              return false;
            }
  
            try {
              if (!VK.UI.active.top || VK.UI.active.closed) {
                VK.UI.popupOpened = false;
                authCallback();
                return true;
              }
            } catch(e) {
              VK.UI.popupOpened = false;
              authCallback();
              return true;
            }
            setTimeout(popupCheck, 100);
          };
  
          setTimeout(popupCheck, 100);
        },
  
        // Logout user from app, vk.com & login.vk.com
        logout: function(cb) {
          VK.Auth.revokeGrants(cb);
        },
  
        revokeGrants: function(cb) {
          var onLogout = function(resp) {
            VK.Observer.unsubscribe('auth.statusChange', onLogout);
            if (cb) {
              cb(resp);
            }
          }
  
          VK.Observer.subscribe('auth.statusChange', onLogout);
          if (VK._session && VK._session.sid) {
            var url = VK._domain.login + '?act=openapi&oauth=1&aid=' + parseInt(VK._apiId, 10) + '&location=' + encodeURIComponent(window.location.hostname) + '&do_logout=1&token=' + VK._session.sid;
            if (VK.Api.supportCORS()) {
              var logoutCallback = function() {
                VK.Auth.setSession(null, 'unknown');
              };
  
              VK.Api.makeRequest(url + '&new=1', logoutCallback);
            } else {
              VK.Api.attachScript(url);
            }
          }
  
          VK.Cookie.clear();
        },
  
        // Get current login status from session (sync) (not use on load time)
        getSession: function() {
          return VK._session;
        },
  
        // Get current login status from vk.com (async)
        getLoginStatus: function(cb, force) {
          if (!VK._apiId) {
            return;
          }
  
          if (cb) {
            if (!force && VK.Auth._loadState == 'loaded') {
              cb({status: VK._userStatus, session: VK._session});
              return;
            } else {
              VK.Observer.subscribe('auth.loginStatus', cb);
            }
          }
  
          if (!force && VK.Auth._loadState == 'loading') {
            return;
          }
  
          VK.Auth._loadState = 'loading';
  
          var url = VK._domain.login + '?act=openapi&oauth=1&aid=' + parseInt(VK._apiId, 10) + '&location=' + encodeURIComponent(window.location.hostname);
          if (VK.Api.supportCORS()) {
            var loginCallback = function(response) {
              if (!this.JSON) {
                this.JSON = {};
              }
  
              if (typeof JSON.parse !== 'function') {
                //IE6 and IE7
                response = eval(response);
              } else {
                response = JSON.parse(response);
              }
  
              VK.Auth._loadState = 'loaded';
              if (response && response.auth) {
                var session = {
                  mid: response.user.id,
                  sid: response.access_token,
                  sig: response.sig,
                  secret: response.secret,
                  expire: response.expire
                };
  
                if (force) {
                  session.user = response.user;
                }
  
                var status = 'connected';
              } else {
                var session = null;
                var status = response.user ? 'not_authorized' : 'unknown';
                VK.Cookie.clear();
              }
  
              VK.Auth.setSession(session, status, false, response);
              VK.Observer.publish('auth.loginStatus', {session: session, status: status});
              VK.Observer.unsubscribe('auth.loginStatus');
            };
  
            VK.Api.makeRequest(url + '&new=1', loginCallback);
          } else {
            var rnd = parseInt(Math.random() * 10000000, 10);
            while (VK.Auth.lsCb[rnd]) {
              rnd = parseInt(Math.random() * 10000000, 10);
            }
  
            VK.Auth.lsCb[rnd] = function(response) {
              delete VK.Auth.lsCb[rnd];
              VK.Auth._loadState = 'loaded';
              if (response && response.auth) {
                var session = {
                  mid: response.user.id,
                  sid: response.access_token,
                  sig: response.sig,
                  secret: response.secret,
                  expire: response.expire
                };
                if (force) session.user = response.user;
                var status = 'connected';
              } else {
                var session = null;
                var status = response.user ? 'not_authorized' : 'unknown';
                VK.Cookie.clear();
              }
              VK.Auth.setSession(session, status, false, response);
              VK.Observer.publish('auth.loginStatus', {session: session, status: status});
              VK.Observer.unsubscribe('auth.loginStatus');
            };
  
              // AttachScript here
            VK.Api.attachScript(url+'&rnd='+rnd);
          }
        }
      };
    }
  
    if (!VK.App) {
      VK.App = {
        _appOpened: false,
        _addToGroupPopup: null,
  
        open: function (url, params) {
          if (VK.App._appOpened || !VK._apiId) {
            return;
          }
  
          if (!VK._session) {
            VK.Auth.login(function(resp) {
              if (resp && resp.session) {
                VK.App._openApp(url, params);
              }
            });
          } else {
            VK.App._openApp(url, params);
          }
        },
  
        _openApp: function (url, params) {
          var src, box, request = [];
          params = params || {};
  
          if (!url || !VK._apiId || VK.App._appOpened) {
            return;
  
          }
  
          if (Object.prototype.toString.call(params.data) === '[object Object]') {
            try {
              params.data = JSON.stringify(params.data);
            } catch (e) {
              params.data = '';
            }
          }
  
          src = VK._domain.base + '/apps?act=open_external_app_openapi&aid=' + VK._apiId;
          params['aid'] = VK._apiId;
  
          for (var arg in params) {
            var val = '';
            if (!params.hasOwnProperty(arg)) {
              continue;
            }
            if (params[arg] !== undefined) {
              val = encodeURIComponent(params[arg]);
            }
            request.push(encodeURIComponent(arg) + '=' + val);
          }
  
          src += '&url=' + url;
          src += '&q=' + encodeURIComponent(request.join('&'));
  
          box = VK.Util.Box(src, {}, {
            closeExternalApp: function() {
              if (VK.App._result) {
                VK.Observer.publish('app.done', VK.App._result);
                VK.App._result = null;
              } else {
                VK.Observer.publish('app.closed');
              }
              box.hide();
              VK.App._appOpened = false;
            },
            externalAppDone: function (params, noCloseLayer) {
              if (noCloseLayer) {
                VK.App._result = params;
              } else {
                VK.Observer.publish('app.done', params);
                box.hide();
                VK.App._appOpened = false;
                VK.App._result = null;
              }
            }
          });
          box.show();
          VK.App._appOpened = true;
          VK.App._result = null;
        },
  
        addToGroup: function(appId) {
          if (this._addToGroupPopup && !this._addToGroupPopup.closed) {
            return;
          }
  
          if (this._onAddToGroupDone) {
            VK.Util.removeEvent('message', this._onAddToGroupDone, window);
          }
  
          this._onAddToGroupDone = function(event) {
            if (event.origin === VK._domain.base && event.data.method === 'app.addToGroup') {
              VK.Observer.publish('app.addToGroupDone', {
                app_id: event.data.app_id,
                group_ids: event.data.group_ids
              });
              VK.Util.removeEvent('message', this._onAddToGroupDone, window);
              this._onAddToGroupDone = null;
            }
          }.bind(this);
  
          if (window.postMessage) {
            VK.Util.addEvent('message', this._onAddToGroupDone, window);
          }
  
          this._addToGroupPopup = VK.UI.popup({
            url: VK._domain.base + '/add_community_app.php?aid=' + appId,
            width: 560,
            height: 650
          });
        }
      }
    }
  
  } else { // if VK.xdConnectionCallbacks
    setTimeout(function() {
      var callback;
      while (callback = VK.xdConnectionCallbacks.pop()) {
        callback();
      }
    }, 0);
    if (VK.Widgets && !VK.Widgets._constructor) {
      VK.Widgets = false;
    }
  }
  
  if (!VK.UI) {
    VK.UI = {
      active: null,
      _buttons: [],
      popup: function(options) {
        var
            screenX = typeof window.screenX != 'undefined' ? window.screenX : window.screenLeft,
            screenY = typeof window.screenY != 'undefined' ? window.screenY : window.screenTop,
            outerWidth = typeof window.outerWidth != 'undefined' ? window.outerWidth : document.body.clientWidth,
            outerHeight = typeof window.outerHeight != 'undefined' ? window.outerHeight : (document.body.clientHeight - 22),
            width = options.width,
            height = options.height,
            left = parseInt(screenX + ((outerWidth - width) / 2), 10),
            top = parseInt(screenY + ((outerHeight - height) / 2.5), 10),
            features;
        left = window.screen && window.screenX && screen.left && screen.left > 1000 ? 0 : left; // FF with 2 monitors fix
        features = (
            'width=' + width +
            ',height=' + height +
            ',left=' + left +
            ',top=' + top
        );
        this.active = window.open(options.url, 'vk_openapi', features);
        return this.active;
      },
      button: function(el, handler) {
        var html = '';
  
        if (typeof el == 'string') {
          el = document.getElementById(el);
        }
  
  
        this._buttons.push(el);
        index = this._buttons.length - 1;
  
        html = (
            '<table cellspacing="0" cellpadding="0" id="openapi_UI_' + index + '" onmouseover="VK.UI._change(1, ' + index + ');" onmouseout="VK.UI._change(0, ' + index + ');" onmousedown="VK.UI._change(2, ' + index + ');" onmouseup="VK.UI._change(1, ' + index + ');" style="cursor: pointer; border: 0px; font-family: tahoma, arial, verdana, sans-serif, Lucida Sans; font-size: 10px;"><tr style="vertical-align: middle">' +
            '<td><div style="border: 1px solid #3b6798;border-radius: 2px 0px 0px 2px;-moz-border-radius: 2px 0px 0px 2px;-webkit-border-radius: 2px 0px 0px 2px;"><div style="border: 1px solid #5c82ab; border-top-color: #7e9cbc; background-color: #6D8DB1; color: #fff; text-shadow: 0px 1px #45688E; height: 15px; padding: 2px 4px 0px 6px;line-height: 13px;">&#1042;&#1086;&#1081;&#1090;&#1080;</div></div></td>' +
            '<td><div style="background: url(' + VK._domain.base + '/images/btns.png) 0px -42px no-repeat; width: 21px; height: 21px"></div></td>' +
            '<td><div style="border: 1px solid #3b6798;border-radius: 0px 2px 2px 0px;-moz-border-radius: 0px 2px 2px 0px;-webkit-border-radius: 0px 2px 2px 0px;"><div style="border: 1px solid #5c82ab; border-top-color: #7e9cbc; background-color: #6D8DB1; color: #fff; text-shadow: 0px 1px #45688E; height: 15px; padding: 2px 6px 0px 4px;line-height: 13px;">&#1050;&#1086;&#1085;&#1090;&#1072;&#1082;&#1090;&#1077;</div></div></td>' +
            '</tr></table>'
        );
        el.innerHTML = html;
        el.style.width = el.childNodes[0].offsetWidth + 'px';
      },
      _change: function(state, index) {
        var row = document.getElementById('openapi_UI_' + index).rows[0];
        var elems = [row.cells[0].firstChild.firstChild, row.cells[2].firstChild.firstChild];
        for (var i = 0; i < 2; ++i) {
          var elem = elems[i];
          if (state === 0) {
            elem.style.backgroundColor = '#6D8DB1';
            elem.style.borderTopColor = '#7E9CBC';
            elem.style.borderLeftColor = elem.style.borderRightColor = elem.style.borderBottomColor = '#5C82AB';
          } else if (state == 1) {
            elem.style.backgroundColor = '#7693B6';
            elem.style.borderTopColor = '#88A4C4';
            elem.style.borderLeftColor = elem.style.borderRightColor = elem.style.borderBottomColor = '#6088B4';
          } else if (state == 2) {
            elem.style.backgroundColor = '#6688AD';
            elem.style.borderBottomColor = '#7495B8';
            elem.style.borderLeftColor = elem.style.borderRightColor = elem.style.borderTopColor = '#51779F';
          }
        }
        if (state === 0 || state == 2) {
          row.cells[2].firstChild.style.backgroundPosition = '0px -42px';
        } else if (state == 1) {
          row.cells[2].firstChild.style.backgroundPosition = '0px -63px';
        }
      }
    };
  }
  
  if (!VK.XDM) {
    VK.XDM = {
      remote: null,
      init: function() {
        if (this.remote) return false;
        var url = VK._domain.api + '/' + VK._path.proxy;
        this.remote = new fastXDM.Server({
          onInit: function() {
            VK.xdReady = true;
            VK.Observer.publish('xdm.init');
          }
        });
  
        this.remote.append(document.getElementById(VK._rootId), {
          src: url
        });
      },
      xdHandler: function(code) {
        try {
          eval('VK.' + code);
        } catch(e) {}
      }
    };
  }
  
  if (!VK.Observer) {
    VK.Observer = {
      _subscribers: function() {
        if (!this._subscribersMap) {
          this._subscribersMap = {};
        }
        return this._subscribersMap;
      },
      publish: function(eventName) {
        var
            args = Array.prototype.slice.call(arguments),
            eventName = args.shift(),
            subscribers = this._subscribers()[eventName],
            i, j;
  
        if (!subscribers) return;
  
        for (i = 0, j = subscribers.length; i < j; i++) {
          if (subscribers[i] != null) {
            subscribers[i].apply(this, args);
          }
        }
      },
      subscribe: function(eventName, handler) {
        var
            subscribers = this._subscribers();
  
        if (typeof handler != 'function') return false;
  
        if (!subscribers[eventName]) {
          subscribers[eventName] = [handler];
        } else {
          subscribers[eventName].push(handler);
        }
      },
      unsubscribe: function(eventName, handler) {
        var
            subscribers = this._subscribers()[eventName],
            i, j;
  
        if (!subscribers) return false;
        if (typeof handler == 'function') {
          for (i = 0, j = subscribers.length; i < j; i++) {
            if (subscribers[i] == handler) {
              subscribers[i] = null;
            }
          }
        } else {
          delete this._subscribers()[eventName];
        }
      }
    };
  }
  
  if (!VK.Widgets) {
    VK.Widgets = {};
  
    VK.Widgets.count = 0;
    VK.Widgets.RPC = {};
  
    VK.Widgets.loading = function(obj, enabled) {
      obj.style.background = enabled ? 'url("' + VK._domain.base + '/images/upload.gif") center center no-repeat transparent' : 'none';
    };
  
    VK.Widgets.Comments = function(objId, options, page) {
      var pData = VK.Util.getPageData();
      if (!VK._apiId) throw Error('VK not initialized. Please use VK.init');
      options = VK.Util.parseOptions(options);
  
      var obj = document.getElementById(objId),
        params = {
          limit: options.limit || 10,
          height: options.height || 0,
          mini: options.mini === undefined ? 'auto' : options.mini,
          norealtime: options.norealtime ? 1 : 0
        }, mouseup = function() {
          rpc.callMethod('mouseUp');
          return false;
        }, move = function(event) {
          rpc.callMethod('mouseMove', {screenY: event.screenY});
        }, iframe, rpc;
  
      if (options.browse) { // browse all comments
        params.browse = 1;
        params.replies = options.replies || 0;
      } else { // page
        var url = options.pageUrl || pData.url;
        if (url.substr(0, 1) == '/') {
          url = (location.protocol + '//' + location.host) + url;
        }
        VK.extend(params, {
          page: page || 0,
          status_publish: options.autoPublish === undefined ? 0 : options.autoPublish,
          attach: options.attach === undefined ? '*' : (options.attach ? options.attach : ''),
          url: url,
          title: options.pageTitle || pData.title,
          description: options.pageDescription || pData.description,
          image: options.pageImage || pData.image
        });
      }
      if (options.onChange) { // DEPRECATED
        VK.Observer.subscribe('widgets.comments.new_comment', options.onChange);
        VK.Observer.subscribe('widgets.comments.delete_comment', options.onChange);
      }
  
      return VK.Widgets._constructor('widget_comments.php', objId, options, params, {
        showBox: function(url, props) {
          var box = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
            proxy: rpc
          });
          box.show();
        },
        startDrag: function() {
          cursorBack = window.document.body.style.cursor;
          window.document.body.style.cursor = 'pointer';
          VK.Util.addEvent('mousemove', move);
          VK.Util.addEvent('mouseup', mouseup);
        },
        stopDrag: function() {
          window.document.body.style.cursor = cursorBack;
          VK.Util.removeEvent('mousemove', move);
          VK.Util.removeEvent('mouseup', mouseup);
        }
      }, {
        startHeight: 133,
        minWidth: 300
      }, function(o, i, r) {iframe = i; rpc = r;});
    };
  
    VK.Widgets.CommentsBrowse = function(objId, options) {
      options = VK.Util.parseOptions(options);
      options.browse = 1;
      return VK.Widgets.Comments(objId, options);
    };
  
    VK.Widgets.Recommended = function(objId, options) {
      var pData = VK.Util.getPageData();
      if (!VK._apiId) throw Error('VK not initialized. Please use VK.init');
      options = VK.Util.parseOptions(options);
      var params = {
        limit: options.limit || 5,
        max: options.max || 0,
        sort: options.sort || 'friend_likes',
        verb: options.verb || 0,
        period: options.period || 'week',
        target: options.target || 'parent'
      };
      return VK.Widgets._constructor('widget_recommended.php', objId, options, params, {}, {
        startHeight: (116 + params.limit * 47 - 15),
        minWidth: 150
      });
    };
  
    VK.Widgets.Post = function(objId, ownerId, postId, hash, options) {
      options = VK.Util.parseOptions(options);
      var obj = document.getElementById(objId),
        params = {
          owner_id: ownerId,
          post_id: postId,
          hash: hash || '',
          from: options ? options.from : '',
        }, iframe, rpc, cursorBack;
      return VK.Widgets._constructor('widget_post.php', objId, options, params, {
        showBox: function(url, props) {
          var box = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
            proxy: rpc
          });
          box.show();
        },
        startDrag: function() {
          cursorBack = window.document.body.style.cursor;
          window.document.body.style.cursor = 'pointer';
        },
        stopDrag: function() {
          window.document.body.style.cursor = cursorBack;
        }
      }, {
        startHeight: 90,
        minWidth: 250
      }, function(o, i, r) {iframe = i; rpc = r;});
    };
  
    VK.Widgets.Like = (function(Like) {
      if (Like) return Like;
  
      var instances = [];
  
      Like = function(objId, options, page) {
        var pData = VK.Util.getPageData();
        if (!VK._apiId) throw Error('VK not initialized. Please use VK.init');
        options = VK.extend(VK.Util.parseOptions(options), {allowTransparency: true});
        var verticalBtnHeightWidth = {
              18: 43,
              20: 47,
              22: 51,
              24: 55,
              30: 67,
            },
            type = (options.type == 'full' || options.type == 'button' || options.type == 'vertical' || options.type == 'mini') ? options.type : 'full',
            autoWidth = options.width === 'auto' && (type == 'button' || type == 'mini'),
            btnHeight = parseInt(options.height, 10) || 22,
            size = btnHeight && verticalBtnHeightWidth[btnHeight] ? btnHeight : 22,
            width = autoWidth ? 153 : (type == 'full' ? Math.max(200, options.width || 350) : (type == 'button' ? 180 : (type == 'mini' ? 115 : verticalBtnHeightWidth[size]))),
            height = type == 'vertical' ? (2 * btnHeight + 7) : btnHeight,
            params = {
              page: page || 0,
              url: options.pageUrl || pData.url,
              type: type,
              verb: options.verb == 1 ? 1 : 0,
              color: options.color || '',
              title: options.pageTitle || pData.title,
              description: options.pageDescription || pData.description,
              image: options.pageImage || pData.image,
              text: (options.text || '').substr(0, 140),
              h: btnHeight
            },
            ttHere = options.ttHere || false,
            isOver = false,
            hideTimeout = null,
            obj, buttonIfr, buttonRpc, tooltipIfr, tooltipRpc, checkTO;
        if (type == 'vertical' || type == 'button' || type == 'mini') delete options.width;
        if (autoWidth) params.auto_width = 1;
        function showTooltip(force) {
          if ((!isOver && !force) || !tooltipRpc) return;
          if (!tooltipIfr || !tooltipRpc || tooltipIfr.style.display != 'none' && tooltipIfr.getAttribute('vkhidden') != 'yes') return;
          hideTimeout && clearTimeout(hideTimeout);
          checkTO && clearTimeout(checkTO);
          var scrollTop = options.getScrollTop ? options.getScrollTop() : (document.body.scrollTop || document.documentElement.scrollTop || 0);
          var objPos = VK.Util.getXY(obj, options.fixed);
          var startY = ttHere ? 0 : objPos[1];
          if (scrollTop > objPos[1] - 120 && options.tooltipPos != 'top' || type == 'vertical' || options.tooltipPos == 'bottom') {
            tooltipIfr.style.top = (startY + height + 2) + 'px';
            tooltipRpc.callMethod('show', false, type+'_'+size);
          } else {
            tooltipIfr.style.top = (startY - 128) + 'px';
            tooltipRpc.callMethod('show', true, type+'_'+size);
          }
          VK.Util.ss(tooltipIfr, {left: (ttHere ? 0 : objPos[0]) - (type == 'full' || type == 'button' ? 32 : 2) + 'px', display: 'block', opacity: 1, filter: 'none'});
          tooltipIfr.setAttribute('vkhidden', 'no');
          isOver = true;
        }
  
        function hideTooltip(force) {
          if ((isOver && !force) || !tooltipRpc) return;
          tooltipRpc.callMethod('hide');
          buttonRpc.callMethod('hide');
          hideTimeout = setTimeout(function() {
            tooltipIfr.style.display = 'none'
          }, 400);
        }
  
        var widgetId = VK.Widgets._constructor('widget_like.php', objId, options, params, {
          initTooltip: function(counter) {
            tooltipRpc = new fastXDM.Server({
              onInit: counter ? function() {
                  showTooltip();
                } : function() {},
              proxy: buttonRpc,
              showBox: function(url, props) {
                var box = VK.Util.Box(VK.Util.getAbsUrl(url), [props.width, props.height], {
                  proxy: tooltipRpc
                });
                box.show();
              },
            }, false, {safe: true});
            tooltipIfr = tooltipRpc.append(ttHere ? obj : document.body, {
              src: buttonIfr.src + '&act=a_like_tooltip',
              scrolling: 'no',
              allowTransparency: true,
              id: buttonIfr.id + '_tt',
              style: {position: 'absolute', padding: 0, display: 'none', opacity: 0.01, filter: 'alpha(opacity=1)', border: '0', width: '274px', height: '130px', zIndex: 5000, overflow: 'hidden'}
            });
            tooltipIfr.setAttribute('vkhidden', 'yes');
  
            tooltipIfr.onmouseover = function() {
              clearTimeout(checkTO);
              isOver = true;
            };
            tooltipIfr.onmouseout = function() {
              clearTimeout(checkTO);
              isOver = false;
              checkTO = setTimeout(function() {hideTooltip(); }, 200);
            };
          },
          showTooltip: showTooltip,
          hideTooltip: hideTooltip,
          destroy: function() {
            buttonRpc.destroy();
            try {buttonIfr.src = 'about: blank;';} catch (e) {}
            buttonIfr.parentNode.removeChild(buttonIfr);
            if (tooltipIfr) {
              try {tooltipIfr.src = 'about: blank;';} catch (e) {}
              tooltipIfr.parentNode.removeChild(tooltipIfr);
            }
            tooltipRpc && tooltipRpc.destroy();
          },
          showBox: function(url, props) {
            var box = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
              proxy: buttonRpc
            });
            box.show();
          },
          proxy: function() {
            if (tooltipRpc) {
              tooltipRpc.callMethod.apply(tooltipRpc, arguments);
            }
          }
        }, {
          startHeight: height,
          minWidth: width
        }, function(o, i, r) {
          buttonRpc = r;
          VK.Util.ss(obj = o, {height: height + 'px', width: width + 'px', position: 'relative', clear: 'both'});
          VK.Util.ss(buttonIfr = i, {height: height + 'px', width: width + 'px', overflow: 'hidden', zIndex: 150});
          obj.onmouseover = function() {
            clearTimeout(checkTO);
            isOver = true;
          };
          obj.onmouseout = function() {
            clearTimeout(checkTO);
            isOver = false;
            checkTO = setTimeout(function() {hideTooltip(); }, 200);
          };
        });
  
        instances.push(widgetId);
        return widgetId;
      };
  
      Like.destroyAll = function() {
        var xdm = null;
        while (instances[0]) {
          xdm = VK.Widgets.RPC[instances.pop()];
          xdm && xdm.methods.destroy();
        }
      }
  
      return Like;
    })(VK.Widgets.Like);
  
    VK.Widgets.Poll = function(objId, options, pollId) {
      var pData = VK.Util.getPageData();
      if (!pollId) throw Error('No poll id passed');
      options = VK.Util.parseOptions(options);
      var params = {
        poll_id: pollId,
        url: options.pageUrl || pData.url || location.href,
        title: options.pageTitle || pData.title,
        description: options.pageDescription || pData.description
      };
      if (options.preview) {
        params.is_preview = 1;
        delete options['preview'];
      }
      if (options.share !== undefined) {
        params.share = options.share ? 1 : 0;
      }
      var rpc;
      return VK.Widgets._constructor('al_widget_poll.php', objId, options, params, {
        showBox: function(url, props) {
          var box = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
            proxy: rpc
          });
          box.show();
        }
      }, {
        startHeight: 144,
        minWidth: 300
      }, function(o, i, r) {
        rpc = r;
      });
    };
  
    VK.Widgets.App = function(objId, app_id, options) {
      if (!app_id) throw Error('No app id passed');
      options = VK.Util.parseOptions(options);
      var startHeight = void 0,
          height = void 0,
          minWidth = void 0,
          params = {
            aid: app_id,
            mode: parseInt(options.mode, 10) || 1,
          };
      switch (params.mode) {
        case 1:
          options.width = 144;
          startHeight = 251;
          break;
        case 2:
          options.width = options.width ? Math.max(200, Math.min(10000, parseInt(options.width, 10))) : 200;
          height = startHeight = 193;
          break;
        case 3:
          options.width = options.width ? Math.max(50, Math.min(10000, parseInt(options.width, 10))) : void 0;
          height = startHeight = options.height = ({18: 18, 20: 20, 22: 22, 24: 24, 30: 30})[parseInt(options.height, 10) || 30];
          break;
      }
      minWidth = options.width;
      return VK.Widgets._constructor('widget_app.php', objId, options, params, {}, {
        startHeight: startHeight,
        height: height,
        minWidth: minWidth
      });
    };
  
    VK.Widgets.Community = VK.Widgets.Group = function(objId, options, gid) {
      options = VK.Util.parseOptions(options);
      gid = parseInt(gid, 10);
      if (!gid) {
        throw Error('No group_id passed');
      }
      options.mode = parseInt(options.mode, 10).toString();
      var params = {
          gid: gid,
          mode: (options.mode) ? options.mode : '0'
        },
        startHeight = options.mode == 3 ? 185 : (options.mode == 1 ? 141 : options.height|0 || 290),
        rpc;
      if (options.wall) params.wall = options.wall;
      params.color1 = options.color1 || '';
      params.color2 = options.color2 || '';
      params.color3 = options.color3 || '';
      params.class_name = options.class_name || '';
      if (options.no_head) params.no_head = 1;
      if (options.no_cover) params.no_cover = 1;
      if (options.wide) {
        params.wide = 1;
        if (!options.width || options.width < 300) {
          options.width = 300;
        }
      }
      if (!options.width|0) options.width = 200;
  
      var cursorBack;
  
      function mouseup() {
        rpc.callMethod('mouseUp');
        return false;
      }
  
      function move(event) {
        rpc.callMethod('mouseMove', {screenY: event.screenY});
        return false;
      }
  
      return VK.Widgets._constructor('widget_community.php', objId, options, params, {
        showBox: function(url, props) {
          var box = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
            proxy: rpc
          });
          box.show();
        },
        startDrag: function() {
          cursorBack = window.document.body.style.cursor;
          window.document.body.style.cursor = 'pointer';
          VK.Util.addEvent('mousemove', move);
          VK.Util.addEvent('mouseup', mouseup);
        },
        stopDrag: function() {
          window.document.body.style.cursor = cursorBack;
          VK.Util.removeEvent('mousemove', move);
          VK.Util.removeEvent('mouseup', mouseup);
        },
        auth: function() {
          VK.Auth.login(null, 1);
        }
      }, {
        minWidth: 120,
        startHeight: startHeight
      }, function(o, i, r) {
        rpc = r;
      });
    };
  
    VK.Widgets.Auth = function(objId, options) {
      var pData = VK.Util.getPageData();
      if (!VK._apiId) throw Error('VK not initialized. Please use VK.init');
      options = VK.Util.parseOptions(options);
      if (!options.width) {
        options.width = 200;
      }
      if (options.type) {
        type = 1;
      } else {
        type = 0;
      }
      return VK.Widgets._constructor('widget_auth.php', objId, options, {}, {makeAuth: function(data) {
        if (data.session) {
          VK.Auth._loadState = 'loaded';
          VK.Auth.setSession(data.session, 'connected');
          VK.Observer.publish('auth.loginStatus', {session: data.session, status: 'connected'});
          VK.Observer.unsubscribe('auth.loginStatus');
        }
        if (options.onAuth) {
          options.onAuth(data);
        } else {
          if (options.authUrl) {
            var href = options.authUrl;
          } else {
            var href = window.location.href;
          }
          if (href.indexOf('?') == -1) {
            href+='?';
          } else {
            href+='&';
          }
          var vars = [];
  
          for (var i in data) {
            if (i != 'session') vars.push(i+'='+decodeURIComponent(data[i]).replace(/&/g, '%26').replace(/\#/g, '%23').replace(/\?/, '%3F'));
          }
          window.location.href = href + vars.join('&');
        }
      }}, {
        startHeight: 134
      });
    };
  
    VK.Widgets.Subscribe = function(objId, options, oid) {
      oid = parseInt(oid, 10);
      if (!oid) {throw Error('No owner_id passed');}
      options = VK.Util.parseOptions(options);
      var params = {
        oid: oid
      }, rpc;
      if (options.mode) {
        params.mode = options.mode;
      }
      if (options.soft) {
        params.soft = options.soft;
      }
  
      return VK.Widgets._constructor('widget_subscribe.php', objId, options, params, {
        showBox: function(url, props) {
          var box = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
            proxy: rpc
          });
          box.show();
        },
        auth: function() {
          VK.Auth.login(null, 1);
        }
      }, {
        minWidth: 220,
        startHeight: 22
      }, function(o, i, r) {
        rpc = r;
      });
    };
  
    VK.Widgets.ContactUs = function(objId, options, oid) {
      oid = parseInt(oid, 10);
      if (!oid) throw Error('No group or user id passed');
      options = VK.Util.parseOptions(options);
  
      var params = {
        oid: oid,
        height: ({18: 18, 20: 20, 22: 22, 24: 24, 30: 30})[parseInt(options.height, 10) || 24],
        text: (options.text || '').substr(0, 140)
      }, rpc;
  
      return VK.Widgets._constructor('widget_contactus.php', objId, options, params, {}, {
        startHeight: params.height,
        height: params.height
      }, function(o, i, r) {
        rpc = r;
      });
    };
  
    VK.Widgets.Bookmarks = function(objId, options) {
      options = VK.Util.parseOptions(options);
  
      var params = {
        height: ({18: 18, 20: 20, 22: 22, 24: 24, 30: 30})[parseInt(options.height, 10) || 30],
        url: options.url || window.location.href
      }, rpc;
  
      return VK.Widgets._constructor('widget_bookmarks.php', objId, options, params, {}, {
        startHeight: params.height,
        height: params.height
      }, function(o, i, r) {
        rpc = r;
      });
    };
  
    VK.Widgets.Playlist = function(objId, ownerId, playlistId, hash, options) {
      var params = {
        oid: parseInt(ownerId, 10),
        pid: parseInt(playlistId, 10),
        hash: hash || ''
      }, rpc;
  
      if (!params.oid) throw Error('No owner id passed');
      if (!params.pid) throw Error('No playlist id passed');
      options = VK.Util.parseOptions(options);
  
      return VK.Widgets._constructor('widget_playlist.php', objId, options, params, {
        showBox: function(url, props) {
          var box = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
            proxy: rpc
          });
          box.show();
        }
      }, {
        minWidth: 200
      }, function(o, i, r) {
        rpc = r;
      });
    };
  
    VK.Widgets.Ads = function(objId, options, paramsExtra) {
      options = VK.Util.parseOptions(options);
      paramsExtra = paramsExtra || {};
      var params = {};
      var defaults = {};
      var funcs = {};
      var obj = document.getElementById(objId);
      var iframe;
      var rpc;
  
      var adsParams = {};
      var adsParamsLocal = {};
      var adsParamsDefault = {};
      for (var key in paramsExtra) {
        var keyFix = (inArray(key, ['hash']) ? key : 'ads_' + key);
        adsParams[keyFix] = paramsExtra[key];
      }
  
      if (obj && obj.getBoundingClientRect) {
        obj.style.width  = '100%';
        obj.style.height = '100%';
        var rect = obj.getBoundingClientRect();
        obj.style.width  = '';
        obj.style.height = '';
        adsParams.ads_ad_unit_width_auto  = Math.floor(rect.right - rect.left);
        adsParams.ads_ad_unit_height_auto = Math.floor(rect.bottom - rect.top);
      }
  
      adsParamsDefault.ads_ad_unit_width  = 100;
      adsParamsDefault.ads_ad_unit_height = 100;
  
      adsParamsLocal.ads_ad_unit_width  = (parseInt(adsParams.ads_ad_unit_width)  || adsParams.ads_ad_unit_width === 'auto'  && adsParams.ads_ad_unit_width_auto  || adsParamsDefault.ads_ad_unit_width);
      adsParamsLocal.ads_ad_unit_height = (parseInt(adsParams.ads_ad_unit_height) || adsParams.ads_ad_unit_height === 'auto' && adsParams.ads_ad_unit_height_auto || adsParamsDefault.ads_ad_unit_height);
      if (adsParams.ads_handler) {
        adsParamsLocal.ads_handler = adsParams.ads_handler;
      }
      if (adsParams.ads_handler_empty_html) {
        adsParamsLocal.ads_handler_empty_html = adsParams.ads_handler_empty_html;
      }
  
      delete adsParams.ads_handler;
      delete adsParams.ads_handler_empty_html;
  
      params.act = 'ads_web';
      params.url = location.href;
      VK.extend(params, adsParams);
  
      options.noDefaultParams   = true;
      options.width             = adsParamsLocal.ads_ad_unit_width;
      options.allowTransparency = true;
      defaults.startHeight = adsParamsLocal.ads_ad_unit_height;
      defaults.minWidth    = adsParamsLocal.ads_ad_unit_width;
      funcs.adsOnInit       = adsOnInit;
      funcs.newAdsOnInitLoader = newAdsOnInitLoader;
  
      return VK.Widgets._constructor('ads_rotate.php', objId, options, params, funcs, defaults, onDone);
  
      function newAdsOnInitLoader(deps) {
        // replace's âçÿòû èç walkVar
        var json = JSON.parse(deps.replace(/&#039;/g, '\'').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
        adsAttachScript(json);
      }
      function adsOnInit(errorCode, adsParamsExport) {
        VK.Widgets.loading(obj, false);
        adsProcessParams(adsParamsExport);
        if (options.onAdsReady) options.onAdsReady.apply(options.onAdsReady, Array.prototype.slice.call(arguments));
        adsProcessHandler(errorCode);
      }
      function adsAttachScript(adsScriptData) {
        if (!('vk__adsLight' in window)) {
          window.vk__adsLight = false;
          var attachScriptFunc = (VK.Api && VK.Api.attachScript || VK.addScript);
          if (Array.isArray(adsScriptData)) {
            adsScriptData.forEach(function(url){
              attachScriptFunc(VK._domain.base + url)
            });
          } else {
            var adsScriptVersion = parseInt(adsScriptData);
            attachScriptFunc(VK._domain.base + jsc('/web/ads_light.js?') + adsScriptVersion);
          }
        } else if (window.vk__adsLight && vk__adsLight.userHandlers && vk__adsLight.userHandlers.onInit) {
          vk__adsLight.userHandlers.onInit(false); // false - do not publish initial onInit
        }
      }
      function adsProcessParams(adsParamsExport) {
        if (!adsParamsExport) {
          return;
        }
        for (var paramName in adsParamsExport) {
          var paramValue = adsParamsExport[paramName];
          if (paramName === 'ads_ad_unit_width' || paramName === 'ads_ad_unit_height') {
            if (!(paramName in adsParams)) {
              adsParamsLocal[paramName] = (parseInt(paramValue) || paramValue === 'auto' && adsParams[paramName + '_auto'] || adsParamsDefault[paramName]);
            }
          } else {
            if (!(paramName in adsParamsLocal)) {
              adsParamsLocal[paramName] = paramValue;
            }
          }
        }
      }
      function adsProcessHandler(errorCode) {
        var handlerResult = adsEvalHandler(adsParamsLocal.ads_handler, errorCode);
        if (errorCode <= 0 && handlerResult !== true) {
          try { console.log('VK: ad_unit_id = ' + adsParams.ads_ad_unit_id, ', errorCode = ', errorCode); } catch (e) {}
          adsInsertHtmlHandler(adsParamsLocal.ads_handler_empty_html, adsParamsLocal.ads_ad_unit_width, adsParamsLocal.ads_ad_unit_height);
        }
      }
      function adsEvalHandler(handler) {
        var result = false;
        try {
          if (!handler) {
            return false;
          }
          var func = false;
          if (isFunction(handler)) {
            func = handler;
          } else if (isString(handler)) {
            var handlerFuncs = handler.split('.');
            func = window;
            for (var i = 0, len = handlerFuncs.length; i < len; i++) {
              func = func[handlerFuncs[i]];
              if (!func) {
                break;
              }
            }
            if (!func) {
              if (handler.substr(0, 8) === 'function') {
                handler = 'return ' + handler + ';';
              }
              var handlerResult = (new Function(handler))();
              if (isFunction(handlerResult)) {
                func = handlerResult;
              } else {
                result = handlerResult;
              }
            }
          }
          if (func) {
            var args = Array.prototype.slice.call(arguments, 1);
            result = func.apply(func, args);
          }
        } catch (e) {
          try {
            console.error(e);
          } catch (e2) {}
        }
  
        return result;
  
        function isFunction(obj) {
          return Object.prototype.toString.call(obj) === '[object Function]';
        }
        function isString(obj) {
          return Object.prototype.toString.call(obj) === '[object String]';
        }
      }
      function adsInsertHtmlHandler(handlerHtml, width, height) {
        if (!handlerHtml) {
          return;
        }
        if (!obj) {
          return;
        }
  
        width  = (width  ? width  + 'px' : '');
        height = (height ? height + 'px' : '');
  
        var iframeHandlerHtml = '<html><head></head><body style="padding: 0; margin: 0;"><div>' + handlerHtml + '</div></body></html>';
  
        var iframeHandler = document.createElement('iframe');
        iframeHandler.onload            = fixIframeHeight;
        iframeHandler.id                = (iframe ? iframe.id : ('vkwidget-' + Math.round(Math.random() * 1000000))) + '_ads_html_handler';
        iframeHandler.src               = 'about:blank';
        iframeHandler.width             = '100%';
        iframeHandler.height            = '100%';
        iframeHandler.scrolling         = 'no';
        iframeHandler.frameBorder       = '0';
        iframeHandler.allowTransparency = true;
        iframeHandler.style.overflow    = 'hidden';
        iframeHandler.style.width       = width;
        iframeHandler.style.height      = height;
  
        obj.style.width                 = width;
        obj.style.height                = height;
  
        obj.appendChild(iframeHandler);
  
        iframeHandler.contentWindow.vk_ads_html_handler = iframeHandlerHtml;
        iframeHandler.src = 'javascript:window["vk_ads_html_handler"]';
  
        function fixIframeHeight() {
          if (height) {
            return;
          }
          try {
            var rect = iframeHandler.contentWindow.document.body.firstChild.getBoundingClientRect();
            var heightFix = Math.ceil(rect.bottom - rect.top);
            if (heightFix) {
              iframeHandler.style.height = heightFix;
              obj.style.height           = heightFix;
            }
          } catch (e) {}
        }
      }
      function indexOf(arr, value, from) {
        for (var i = from || 0, l = (arr || []).length; i < l; i++) {
          if (arr[i] == value) return i;
        }
        return -1;
      }
      function inArray(value, arr) {
        return indexOf(arr, value) != -1;
      }
      function onDone(o, i, r) {
        obj = o;
        iframe = i;
        rpc = r;
      }
    };
  
    VK.Widgets.AllowMessagesFromCommunity = function (objId, options, groupId) {
      groupId = parseInt(groupId, 10);
      if (!groupId || groupId < 0) throw Error('No group id passed');
      options = VK.Util.parseOptions(options);
  
      var params = {
        height: ({22: 22, 24: 24, 30: 30})[parseInt(options.height, 10) || 24],
        key: options.key ? options.key.substr(0, 256) : '',
        group_id: groupId
      }, rpc;
  
      return VK.Widgets._constructor('widget_allow_messages_from_community.php', objId, options, params, {}, {
        startHeight: params.height,
        height: params.height
      }, function(o, i, r) {
        rpc = r;
      });
    };
  
    VK.Widgets.Article = function(id, url, options) {
      var params = {
        url: url
      };
  
      options = VK.Util.parseOptions(options);
  
      var rpc;
      return VK.Widgets._constructor('widget_article.php', id, options, params, {
        showBox: function(url) {
          var box = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
            proxy: rpc
          });
          box.show();
        },
      }, {
      }, function(o, i, r) {
        rpc = r;
      });
    };
  
    VK.Widgets.Podcast = function(id, episode, hash, options) {
      var params = {
        episode: episode,
        hash: hash,
      };
  
      options = VK.Util.parseOptions(options);
  
      return VK.Widgets._constructor('widget_podcast.php', id, options, params, {
        showBox: function(url) {
          var box = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
            proxy: rpc
          });
          box.show();
        },
      }, {
        minWidth: 300,
        startHeight: 150,
      });
    };
  
    VK.Widgets.CommunityMessages = (function(CommunityMessages) {
      if (CommunityMessages) return CommunityMessages;
  
      var instances = {}, wCur = {};
      var BUTTONS_CONF = {
        no_button: {width: 0, height: 0},
        blue_circle: {
          width: 50,
          height: 50,
          margin: {
            bottom: 20
          }
        }
      }, DEFAULT_BUTTON_TYPE = 'blue_circle',
      BUTTON_POSITIONS = {
        left: {
          bottom: 0,
          left: 20
        },
        right: {
          bottom: 0,
          right: 20
        }
      }, DEFAULT_BUTTON_POSITION = 'right';
  
      /* options
        - welcomeScreen
        - expandTimeout
        - shown || expended
        - widgetPosition
        - buttonType
        - disableButtonTooltip
        - tooltipButtonText
        - disableNewMessagesSound
        - disableExpandChatSound
        - disableTitleChange
      */
      CommunityMessages = function(objId, gid, options) {
        options = VK.Util.parseOptions(options);
  
        options.width = 300;
        options.height = 399;
  
        options.expandTimeout = parseInt(options.expandTimeout) || 0;
  
        var params = {
          gid: gid
        };
  
        options.expanded = parseInt(options.expanded) || 0;
  
        if (!options.from_dev && lsGet('expanded') != null || options.expanded) {
          options.shown = 1;
        }
  
        if (options.shown) {
          params.shown = 1;
        }
  
        if (!options.welcomeScreen) {
          params.disable_welcome_screen = 1;
        }
  
        params.ref_source_info = options.ref_source_info;
        params.ref_source_link = location.href;
  
        var buttonType = options.buttonType;
        if (Object.keys(BUTTONS_CONF).indexOf(buttonType) == -1) {
          buttonType = DEFAULT_BUTTON_TYPE;
        }
  
        if (buttonType == 'no_button') {
          options.disableButtonTooltip = 1;
        }
  
        if (options.disableButtonTooltip) {
          params.disable_tooltip = 1;
        }
        if (options.tooltipButtonText) {
          params.tooltip_text = options.tooltipButtonText;
        }
  
        if (options.disableNewMessagesSound) {
          params.disable_new_messages_sound = 1;
        }
  
        if (instances[objId]) {
          CommunityMessages.destroy(objId);
        }
  
        params.domain = document.domain;
  
        options.no_loading = 1;
  
        var curBox = false, expanded = 0;
        var ttSize = [0, 0], widgetPosition;
  
        changeWidgetPosition(options.widgetPosition);
        params.button_position = options.widgetPosition;
  
        var chatRpc, chatIfr;
        var inited = 0, timers = {};
        instances[objId] = VK.Widgets._constructor('widget_community_messages.php', objId, options, params, {
          onStartLoading: function() {
            var obj = document.getElementById(objId);
            obj.style.position = 'fixed';
            obj.style['z-index'] = 10000;
            updateWidgetPosition();
          },
          onReady: function () {
            inited = 1;
            if (options.expandTimeout > 0 && !options.shown) {
              timers.showTimer = setTimeout(function () {
                expandChat({
                  playSong: !options.disableExpandChatSound,
                  noSaveState: 1
                });
              }, options.expandTimeout);
            }
          },
          showBox: function(url) {
            if (curBox) {
              try {
                curBox.hide();
                try {
                  curBox.iframe.src = 'about: blank;';
                } catch (e) {}
                curBox.iframe.parentNode.removeChild(curBox.iframe);
              } catch(e) { }
            }
            curBox = VK.Util.Box(VK.Util.getAbsUrl(url), [], {
              proxy: rpc
            });
            curBox.show();
          },
          setTooltipSize: function (size) {
            ttSize = size;
            if (!expanded) {
              minimize();
            }
          },
          expand: function(opts) {
            opts = opts || {};
            expanded = 1;
            expand();
  
            if (!opts.noSaveState) {
              lsSet('expanded', 1);
            }
          },
          minimize: function() {
            setTimeout(function() {
              expanded = 0;
              minimize(objId);
              lsRemove('expanded');
            }, 120);
          },
          canNotWrite: function(type) {
            options.onCanNotWrite && options.onCanNotWrite(type);
          },
          destroy: function() {
            chatRpc.destroy();
            try {chatIfr.src = 'about: blank;';} catch (e) {}
            try {
              chatIfr.parentNode.removeChild(chatIfr);
            } catch(e) { }
          },
          fatalError: function(error_code, public_id) {
  
            var query = {
              code: error_code,
              widget: 2,
              public_id: public_id,
            };
  
            if (error_code == 1903) {
              query.referrer_domain = document.domain;
            }
  
            var query_str = [];
            for(var i in query) {
              query_str.push(i+'='+query[i]);
            }
  
            CommunityMessages.destroy(objId);
            var box = VK.Util.Box(VK.Util.getAbsUrl('blank.php?'+query_str.join('&')));
            box.show();
          },
          setPageTitle: function (title) {
            if (options.disableTitleChange) {
              return;
            }
            stopTitleAnimation();
            wCur.oldTitle = document.title || null;
            wCur.title = title;
            wCur.changeTitleMode = 0;
            startTitleNotify(1);
          },
          resetPageTitle: function () {
            stopTitleAnimation();
          },
          newMessage: function () {
            if (document.hasFocus && !document.hasFocus() && !options.disableNewMessagesSound) {
              callRpcMethod('playNewMsgSong');
            }
          }
        }, {}, function(o, i, r) {
          chatRpc = r;
          chatIfr = i;
          if (!options.shown) {
            minimize();
          } else {
            expand();
          }
        });
  
        function startTitleNotify(fast) {
          clearTimeout(wCur.titleTimer);
          wCur.titleTimer = setTimeout(function () {
            if (wCur.changeTitleMode == 1) {
              document.title = wCur.oldTitle || '';
            } else {
              document.title = wCur.title;
            }
            wCur.changeTitleMode = wCur.changeTitleMode == 1 ? 0 : 1;
            startTitleNotify();
          }, fast ? 0 : 1500);
        }
  
        function stopTitleAnimation() {
          if (options.disableTitleChange) {
            return;
          }
          clearTimeout(wCur.titleTimer);
          if (wCur.oldTitle) {
            document.title = wCur.oldTitle;
          } else if (wCur.oldTitle === null) {
            document.title = '';
          }
          wCur.title = '';
        }
  
        function expand() {
          var obj = document.getElementById(objId), frame = obj.getElementsByTagName('iframe')[0];
  
          obj.style.width = frame.width = '372px';
          obj.style.height = frame.height = '399px';
          obj.style.margin = '0px 0px 0px 0px';
          //frame.style.boxShadow = '0 0 0 1px rgba(0, 20, 51, .12), 0 20px 40px 0 rgba(0, 0, 0, 0.3)';
          //frame.style.borderRadius = '6px';
        }
  
        function minimize() {
          var obj = document.getElementById(objId), frame = obj.getElementsByTagName('iframe')[0];
  
          var btnConf = BUTTONS_CONF[buttonType];
  
          var w = btnConf.width + ttSize[0];
          var h = Math.max(btnConf.height, ttSize[1]);
  
          obj.style.width = w + 'px';
          obj.style.height = h + 'px';
          frame.style.boxShadow = 'none';
  
          var margin = btnConf.margin ? btnConf.margin : {};
          obj.style.margin = '0px ' + (margin.right || 0) + 'px ' + (margin.bottom || 0) + 'px 0px';
  
          if (frame) {
            frame.width = w;
            frame.height = h;
          }
        }
  
        function changeWidgetPosition(position) {
          widgetPosition = position;
          if (Object.keys(BUTTON_POSITIONS).indexOf(widgetPosition) == -1) {
            widgetPosition = DEFAULT_BUTTON_POSITION;
          }
          updateWidgetPosition();
          callRpcMethod('changeButtonPosition', widgetPosition);
        }
  
        function updateWidgetPosition() {
          var obj = document.getElementById(objId);
  
          if (!obj) {
            return;
          }
  
          var props = ['left', 'right', 'top', 'bottom'];
          for(var i in props) {
            obj.style[props[i]] = '';
          }
  
          var conf = BUTTON_POSITIONS[widgetPosition];
          for(var i in conf) {
            obj.style[i] = conf[i] + 'px';
          }
  
          if (!inited) {
            return;
          }
  
          if (expanded) {
            expand();
          } else {
            minimize();
          }
        }
  
        function callRpcMethod() {
          chatRpc && chatRpc.callMethod.apply(chatRpc, arguments);
        }
  
        /* opts
          - welcomeScreen
        */
        function expandChat(opts) {
          if (!opts || Object.prototype.toString.call(opts) !== '[object Object]') {
            opts = {};
          }
  
          if (opts.welcomeScreen == undefined) {
            opts.welcomeScreen = options.welcomeScreen;
          }
  
          clearTimeout(timers.showTimer);
          callRpcMethod('expand', opts);
        }
  
        function minimizeChat() {
          callRpcMethod('minimize');
        }
  
        function setSourceData(data) {
          callRpcMethod('setSourceData', VK.extend({
            link: location.href,
          }, data));
        }
  
        VK.Util.addEvent('popstate', setSourceData.bind(this, {}), window);
        VK.Util.addEvent('hashchange', setSourceData.bind(this, {}), window);
  
        function destroyChat() {
          stopTitleAnimation();
          CommunityMessages.destroy(objId);
        }
  
        return {
          expand: expandChat,
          minimize: minimizeChat,
          destroy: destroyChat,
          setSourceData: setSourceData,
          changeButtonPosition: changeWidgetPosition,
          stopTitleAnimation: stopTitleAnimation,
        };
      };
  
      function lsGet(key) {
        if (!window.localStorage) {
          return null;
        }
        return localStorage.getItem('vk_community_widget_' + key);
      }
  
      function lsSet(key, value) {
        window.localStorage && localStorage.setItem('vk_community_widget_' + key, value);
      }
  
      function lsRemove(key) {
        window.localStorage && localStorage.removeItem('vk_community_widget_' + key);
      }
  
      CommunityMessages.destroy = function(objId) {
        if (!instances[objId]) {
          return;
        }
  
        var xdm = VK.Widgets.RPC[instances[objId]];
        xdm && xdm.methods.destroy();
  
        delete instances[objId];
      };
  
      CommunityMessages.expand = function (objId) {
        console.log(instances[objId]);
      };
  
      return CommunityMessages;
    })(VK.Widgets.CommunityMessages);
  
    VK.Widgets._constructor = function(widgetUrl, objId, options, params, funcs, defaults, onDone, widgetId, iter) {
      var obj = document.getElementById(objId);
      widgetId = widgetId || (++VK.Widgets.count);
  
      if (!obj) {
        iter = iter || 0;
        if (iter > 10) {
          throw Error('VK.Widgets: object #' + objId + ' not found.');
        }
        setTimeout(function() {
          VK.Widgets._constructor(widgetUrl, objId, options, params, funcs, defaults, onDone, widgetId, iter + 1);
        }, 500);
        return widgetId;
      }
  
      options = options || {};
      defaults = defaults || {};
      funcs = funcs || {};
  
      if (options.preview) {
        params.preview = 1;
        delete options['preview'];
      }
  
      var ifr, url, urlQueryString, encodedParam, rpc, iframe, i,
        width = options.width === 'auto' ? (obj.clientWidth || obj.offsetWidth || defaults.minWidth) | 0 : parseInt(options.width || 0, 10);
      if (params.act === 'silent_code') {
        width = '1px';
        obj.style.opacity = 0;
        obj.style.display = 'none';
        obj.style.position = 'absolute';
      } else {
        width = width ? (Math.max(defaults.minWidth || 200, Math.min(defaults.maxWidth || 10000, width)) + 'px') : '100%';
      }
      obj.style.width = width;
  
      if (options.height) {
        params.height = options.height;
        obj.style.height = options.height + 'px';
      } else {
        obj.style.height = (defaults.startHeight || 200) + 'px';
      }
  
      if (width === '100%') params.startWidth = (obj.clientWidth || obj.offsetWidth) | 0;
      if (!params.url) params.url = options.pageUrl || location.href.replace(/#.*$/, '');
  
      url = VK._domain.base + '/' + widgetUrl;
      urlQueryString = '';
      if (!options.noDefaultParams) {
        urlQueryString += '&app=' + (VK._apiId || '0') + '&width=' + encodeURIComponent(width)
      }
      urlQueryString += '&_ver=' + VK.version
      if (VK._iframeAppWidget) {
        params.iframe_app = 1;
      }
      var pData = VK.Util.getPageData();
      params.url      = params.url     || pData.url || "";
      params.referrer = params.referrer || document.referrer || "";
      params.title    = params.title   || pData.title  || document.title || "";
      for (i in params) {
        if (i == 'title' && params[i].length > 80) params[i] = params[i].substr(0, 80)+'...';
        if (i == 'description' && params[i].length > 160) params[i] = params[i].substr(0, 160)+'...';
        if (typeof(params[i]) == 'number') {
          encodedParam = params[i];
        } else {
          try {
            encodedParam = encodeURIComponent(params[i]);
          } catch (e) {
            encodedParam = '';
          }
        }
        urlQueryString += '&' + i + '=' + encodedParam;
      }
      urlQueryString += '&' + (+new Date()).toString(16);
      url += '?' + urlQueryString.substr(1);
  
      funcs.onStartLoading && funcs.onStartLoading();
      if (!options.no_loading) {
        VK.Widgets.loading(obj, true);
      }
  
      funcs.showLoader = function(enable) {
        VK.Util.Loader(enable);
      };
      funcs.publish = function() {
        var args = Array.prototype.slice.call(arguments);
        args.push(widgetId);
        VK.Observer.publish.apply(VK.Observer, args);
      };
      funcs.onInit = function() {
        VK.Widgets.loading(obj, false);
        if (funcs.onReady) funcs.onReady();
        if (options.onReady) options.onReady();
      };
      funcs.resize = function(e, cb) {
        obj.style.height = e + 'px';
        var el = document.getElementById('vkwidget' + widgetId);
        if (el) {
          el.style.height = e + 'px';
        }
      };
      funcs.resizeWidget = function(newWidth, newHeight) {
        newWidth  = parseInt(newWidth);
        newHeight = parseInt(newHeight);
        var widgetElem = document.getElementById('vkwidget' + widgetId);
        if (isFinite(newWidth)) {
          obj.style.width = newWidth + 'px';
          if (widgetElem) {
            widgetElem.style.width = newWidth + 'px';
          }
        }
        if (isFinite(newHeight)) {
          obj.style.height = newHeight + 'px';
          if (widgetElem) {
            widgetElem.style.height = newHeight + 'px';
          }
        }
        if (options.onResizeWidget) options.onResizeWidget();
      };
      funcs.updateVersion = function(ver) {
        if (ver > 1) {
          VK.Api.attachScript('//vk.com/js/api/openapi_update.js?'+parseInt(ver));
        }
      };
      rpc = VK.Widgets.RPC[widgetId] = new fastXDM.Server(funcs, function(origin) {
        if (!origin) return true;
        origin = origin.toLowerCase();
        return (origin.match(/(\.|\/)vk\.com($|\/|\?)/));
      }, {safe: true});
      var style = {
        overflow: 'hidden'
      };
      if (options.custom_style && typeof options.custom_style === 'object') {
        style = VK.extend(style, options.custom_style);
      }
      iframe = VK.Widgets.RPC[widgetId].append(obj, {
        src: url,
        width: (width.indexOf('%') != -1) ? width : (parseInt(width) || width),
        height: defaults.startHeight || '100%',
        scrolling: 'no',
        id: 'vkwidget' + widgetId,
        allowTransparency: options.allowTransparency || false,
        style: style,
      });
      onDone && setTimeout(function() {onDone(obj, iframe || obj.firstChild, rpc);}, 10);
      return widgetId;
    };
  }
  
  if (!VK.Util) {
    VK.Util = {
      getPageData: function() {
        if (!VK._pData) {
          var metas = document.getElementsByTagName('meta'), pData = {}, keys = ['description', 'title', 'url', 'image', 'app_id'], metaName;
          for (var i in metas) {
            if (!metas[i].getAttribute) continue;
            if (metas[i].getAttribute && ((metaName = metas[i].getAttribute('name')) || (metaName = metas[i].getAttribute('property')))) {
              for (var j in keys) {
                if (metaName == keys[j] || metaName == 'og:'+keys[j] || metaName == 'vk:'+keys[j]) {
                  pData[keys[j]] = metas[i].content;
                }
              }
            }
          }
          if (pData.app_id && !VK._apiId) {
            VK._apiId = pData.app_id;
          }
          pData.title = pData.title || document.title || '';
          pData.description = pData.description || '';
          pData.image = pData.image || '';
          if (!pData.url && VK._iframeAppWidget && VK._apiId) {
            pData.url = '/app' + VK._apiId;
            if (VK._browserHash) {
              pData.url += VK._browserHash
            }
          }
          var loc = location.href.replace(/#.*$/, '');
          if (!pData.url || !pData.url.indexOf(loc)) {
            pData.url = loc;
          }
          VK._pData = pData;
        }
        return VK._pData;
      },
  
      getStyle: function(elem, name) {
        var ret, defaultView = document.defaultView || window;
        if (defaultView.getComputedStyle) {
          name = name.replace(/([A-Z])/g, '-$1').toLowerCase();
          var computedStyle = defaultView.getComputedStyle(elem, null);
          if (computedStyle) {
            ret = computedStyle.getPropertyValue(name);
          }
        } else if (elem.currentStyle) {
          var camelCase = name.replace(/\-(\w)/g, function(all, letter){
            return letter.toUpperCase();
          });
          ret = elem.currentStyle[name] || elem.currentStyle[camelCase];
        }
  
        return ret;
      },
  
      getAbsUrl: function(url) {
        return VK._domain.base + '/' + url.replace(/^\s*\/?/, '');
      },
  
      parseOptions: function(options) {
        if (Object.prototype.toString.call(options) !== '[object Object]') {
          options = {};
        }
  
        if (options.base_domain) {
          VK._domain.base = options.base_domain;
        }
        if (options.login_domain) {
          VK._domain.login = options.login_domain;
        }
  
        return options;
      },
  
      getXY: function(obj, fixed) {
        if (!obj || obj === undefined) return;
  
        var left = 0, top = 0;
        if (obj.getBoundingClientRect !== undefined) {
          var rect = obj.getBoundingClientRect();
          left = rect.left;
          top = rect.top;
          fixed = true;
        } else if (obj.offsetParent) {
          do {
            left += obj.offsetLeft;
            top += obj.offsetTop;
            if (fixed) {
              left -= obj.scrollLeft;
              top -= obj.scrollTop;
            }
          } while (obj = obj.offsetParent);
        }
        if (fixed) {
          top += window.pageYOffset || window.scrollNode && scrollNode.scrollTop || document.documentElement.scrollTop;
          left += window.pageXOffset || window.scrollNode && scrollNode.scrollLeft || document.documentElement.scrollLeft;
        }
  
        return [left, top];
      },
  
      Loader: function self(enable) {
        if (!self.loader) {
          self.loader = document.createElement('DIV');
          self.loader.innerHTML = '<style type="text/css">\
          @-webkit-keyframes VKWidgetsLoaderKeyframes {0%{opacity: 0.2;}30%{opacity: 1;}100%{opacity: 0.2;}}\
          @keyframes VKWidgetsLoaderKeyframes {0%{opacity: 0.2;}30%{opacity: 1;}100%{opacity: 0.2;}}\
          .VKWidgetsLoader div {width: 7px;height: 7px;-webkit-border-radius: 50%;-khtml-border-radius: 50%;-moz-border-radius: 50%;border-radius: 50%;background: #fff;top: 21px;position: absolute;z-index: 2;-o-transition: opacity 350ms linear; transition: opacity 350ms linear;opacity: 0.2;-webkit-animation-duration: 750ms;-o-animation-duration: 750ms;animation-duration: 750ms;-webkit-animation-name: VKWidgetsLoaderKeyframes;-o-animation-name: VKWidgetsLoaderKeyframes;animation-name: VKWidgetsLoaderKeyframes;-webkit-animation-iteration-count: infinite;-o-animation-iteration-count: infinite;animation-iteration-count: infinite;-webkit-transform: translateZ(0);transform: translateZ(0);}</style><div class="VKWidgetsLoader" style="position: fixed;left: 50%;top: 50%;margin: -25px -50px;z-index: 1002;height: 50px;width: 100px;"><div style="left: 36px;-webkit-animation-delay: 0ms;-o-animation-delay: 0ms;animation-delay: 0ms;"></div><div style="left: 47px;-webkit-animation-delay: 180ms;-o-animation-delay: 180ms;animation-delay: 180ms;"></div><div style="left: 58px;-webkit-animation-delay: 360ms;-o-animation-delay: 360ms;animation-delay: 360ms;"></div><span style="display: block;background-color: #000;-webkit-border-radius: 4px;-khtml-border-radius: 4px;-moz-border-radius: 4px;border-radius: 4px;-webkit-box-shadow: 0px 2px 10px rgba(0, 0, 0, 0.35);-moz-box-shadow: 0px 2px 10px rgba(0, 0, 0, 0.35);box-shadow: 0px 2px 10px rgba(0, 0, 0, 0.35);position: absolute;left: 0;top: 0;bottom: 0; right: 0;z-index: 1;opacity: 0.7;"></span></div>';
          document.body.insertBefore(self.loader, document.body.firstChild);
        }
        self.loader.style.display = enable ? 'block' : 'none';
      },
  
      Box: function(src, sizes, fnc, options) {
        fnc = fnc || {};
        var overflowB = document.body.style.overflow;
        VK.Util.Loader(true);
        var is_vk = /(^|\.)(vk\.com|vkontakte\.ru)$/.test(location.hostname);
        var rpc = new fastXDM.Server(VK.extend(fnc, {
              onInit: function() {
                iframe.style.background = 'transparent';
                iframe.style.visibility = 'visible';
                document.body.style.overflow = 'hidden';
                iframe.setAttribute('allowfullscreen', 1);
                if (is_vk) document.body.className += ' layers_shown';
                VK.Util.Loader();
              },
              hide: function() {
                iframe.style.display = 'none';
              },
              tempHide: function() {
                iframe.style.left = '-10000px';
                iframe.style.top = '-10000px';
                iframe.style.width = '10px';
                iframe.style.height = '10px';
                if (is_vk) document.body.className = document.body.className.replace(/\b\s*?layers_shown\s*\b/, ' ');
                document.body.style.overflow = overflowB;
              },
              destroy: function() {
                try {
                  iframe.src = 'about: blank;';
                } catch (e) {}
                iframe.parentNode.removeChild(iframe);
                if (is_vk) document.body.className = document.body.className.replace(/\b\s*?layers_shown\s*\b/, ' ');
                document.body.style.overflow = overflowB;
              },
              resize: function(w, h) {
              }
            }, true), false, {safe: true}),
            iframe = rpc.append(document.body, {
              src: src.replace(/&amp;/g, '&'),
              scrolling: 'no',
              allowTransparency: true,
              style: {
                position: 'fixed',
                left: 0,
                top: 0,
                zIndex: 1002,
                background: VK._domain.base + '/images/upload.gif center center no-repeat transparent',
                padding: '0',
                border: '0',
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                visibility: 'hidden'
              }
            });
        return {
          show: function(scrollTop, height) {
            iframe.style.display = 'block';
            document.body.style.overflow = 'hidden';
          },
          hide: function() {
            iframe.style.display = 'none';
            document.body.style.overflow = overflowB;
          },
          iframe: iframe,
          rpc: rpc
        }
      },
  
      addEvent: function(type, func, target) {
        target = target || window.document;
        if (target.addEventListener) {
          target.addEventListener(type, func, false);
        } else if (target.attachEvent) {
          target.attachEvent('on'+type, func);
        }
      },
  
      removeEvent: function(type, func, target) {
        target = target || window.document;
        if (target.removeEventListener) {
          target.removeEventListener(type, func, false);
        } else if (target.detachEvent) {
          target.detachEvent('on'+type, func);
        }
      },
  
      ss: function(el, styles) {VK.extend(el.style, styles, true);}
    };
  }
  
  if (!VK.Retargeting) {
    VK.Retargeting = {
      pixelCode: null,
      Init: function (pixelCode) {
        this.pixelCode = pixelCode;
        return this;
      },
      Event: function (event) {
        if (!this.pixelCode) {
          return;
        }
        var pData = VK.Util.getPageData();
        var metatagUrl = pData.url.substr(0, 500);
  
        (window.Image ? (new Image()) : document.createElement('img')).src = 'https://vk.com/rtrg?p=' + this.pixelCode +
          (event ? ('&event=' + encodeURIComponent(event)) : '') +
          (metatagUrl ? ('&metatag_url=' + encodeURIComponent(metatagUrl)) : '');
      },
      Hit: function () {
        this.Event();
      },
      Add: function (audienceID) {
        if (!this.pixelCode || !audienceID) {
          return;
        }
  
        (window.Image ? (new Image()) : document.createElement('img')).src = 'https://vk.com/rtrg?p=' + this.pixelCode + '&audience=' + encodeURIComponent(audienceID);
      },
      ProductEvent: function (priceListID, event, params, opts) {
        if (!this.pixelCode || !event || !priceListID) {
          return;
        }
  
        opts = opts || {};
  
        var canShowErrors = true;
        if (typeof opts.show_errors !== 'undefined') {
          canShowErrors = opts.show_errors ? true : false;
        }
        var errorsIgnore = '0';
        if (typeof opts.errors_ignore !== 'undefined') {
          errorsIgnore = opts.errors_ignore ? '1' : '0';
        }
  
        var pData = VK.Util.getPageData();
        var metatagUrl = pData.url.substr(0, 500);
        var url = 'https://vk.com/rtrg';
        var productParams = params ? JSON.stringify(params) : '';
        var requestParams = {
          'p': this.pixelCode,
          'products_event': event,
          'price_list_id': priceListID,
          'e': '1',
          'i': errorsIgnore,
          'metatag_url' : metatagUrl
        };
        if (productParams) {
          requestParams.products_params = productParams;
        }
  
        var query = Object.keys(requestParams).map(function(key) {
          var segment = encodeURIComponent(key) + '=' + encodeURIComponent(requestParams[key]);
          return segment;
        }).join('&');
  
        var requestUrl = url + '?' + query;
  
        VK.Api.makeRequest(requestUrl, this.onDone.bind(this, canShowErrors));
      },
      onDone: function(canShowErrors, response) {
        if (!response || !canShowErrors) {
          return;
        }
  
        var resp;
        try {
          resp = JSON.parse(response);
        } catch (e) {
          return;
        }
  
        if (!resp || !resp.errors) {
          return;
        }
        this.showErrors(resp.errors);
      },
      showErrors: function(errors) {
        if (!errors && !errors.length) {
          return;
        }
  
        var errorBegin = 'VK Pixel Error (' + this.pixelCode + '): ';
  
        if (typeof errors === 'string') {
          console.error(errorBegin + errors);
          return;
        }
  
        var errorsLength = errors.length;
  
        if (!errorsLength) {
          return;
        }
  
        for (var i = 0; i < errorsLength; i++) {
          console.error(errorBegin + errors[i]);
        }
      }
    };
  }
  
  if (!VK.Pixel) {
    VK.Pixel = function (pixelCode) {
      if (this.constructor != VK.Pixel) {
        throw Error('VK.Pixel was called without \'new\' operator');
      }
  
      VK.extend(this, VK.Retargeting);
      this.pixelCode = pixelCode;
  
      return this;
    };
  }
  
  // Init asynchronous library loading
  window.vkAsyncInit && setTimeout(vkAsyncInit, 0);
  
  if (window.vkAsyncInitCallbacks && vkAsyncInitCallbacks.length) {
    setTimeout(function() {
      var callback;
      while (callback = vkAsyncInitCallbacks.pop()) {
        try {
          callback();
        } catch(e) {
          try {
            console.error(e);
          } catch (e2) {}
        }
      }
    }, 0);
  }
  
  try{stManager.done('api/openapi.js');}catch(e){}
  