(window => {
  const {
    screen: { width, height },
    navigator: { language },
    location,
    localStorage,
    document,
    history,
  } = window;
  const { hostname, pathname, search } = location;
  const { currentScript } = document;

  if (!currentScript) return;

  const _data = 'data-';
  const _false = 'false';
  const attr = currentScript.getAttribute.bind(currentScript);
  const website = attr(_data + 'website-id');
  // const hostUrl = attr(_data + 'host-url');
  const autoTrack = attr(_data + 'auto-track') !== _false;
  const dnt = attr(_data + 'do-not-track');
  const domain = attr(_data + 'domains') || '';
  const domains = domain.split(',').map(n => n.trim());
  // const root = hostUrl
  //   ? hostUrl.replace(/\/$/, '')
  //   : currentScript.src.split('/').slice(0, -1).join('/');
  // const endpoint = `${root}/api/send`;
  const endpoint = '/api/tracker';
  const screen = `${width}x${height}`;
  const eventRegex = /data-umami-event-([\w-_]+)/;
  const eventNameAttribute = _data + 'umami-event';
  const delayDuration = 300;

  /* Helper functions */

  const hook = (_this, method, callback) => {
    const orig = _this[method];

    return (...args) => {
      callback.apply(null, args);

      return orig.apply(_this, args);
    };
  };

  const getPath = url => {
    try {
      return new URL(url).pathname;
    } catch (e) {
      return url;
    }
  };

  const getPayloadBaseData = () => {
    const info = (window.__TRACKER__ && window.__TRACKER__.info) || {};
    const result = {
      'client-time': Date.now(),
      'timezone-offset': new Date().getTimezoneOffset(),
      ...(info.accountId && { 'account-id': info.accountId }),
    };
    return Object.keys(result).length === 0 ? undefined : result;
  };

  const getPayload = () => ({
    website,
    hostname,
    screen,
    language,
    title,
    url: currentUrl,
    referrer: currentRef,
    data: getPayloadBaseData(),
  });

  /* Tracking functions */

  const doNotTrack = () => {
    const { doNotTrack, navigator, external } = window;

    const msTrackProtection = 'msTrackingProtectionEnabled';
    const msTracking = () => {
      return external && msTrackProtection in external && external[msTrackProtection]();
    };

    const dnt = doNotTrack || navigator.doNotTrack || navigator.msDoNotTrack || msTracking();

    return dnt == '1' || dnt === 'yes';
  };

  const trackingDisabled = () =>
    (localStorage && localStorage.getItem('umami.disabled')) ||
    (dnt && doNotTrack()) ||
    (domain && !domains.includes(hostname));

  const handlePush = (state, title, url) => {
    if (!url) return;

    currentRef = currentUrl;
    currentUrl = getPath(url.toString());

    if (currentUrl !== currentRef) {
      setTimeout(track, delayDuration);
    }
  };

  const handleClick = () => {
    function handleFullClick(event) {
      function isTag(element, tagName) {
        return element.tagName === tagName.toUpperCase();
      }

      function findTagParent(rootElement, tagName) {
        const maxSearchDepth = 10;
        let currentElement = rootElement;
        for (let i = 0; i < maxSearchDepth; i++) {
          if (isTag(currentElement, tagName)) {
            return currentElement;
          }
          currentElement = currentElement.parentElement;
          if (!currentElement) {
            return null;
          }
        }
        return null;
      }

      const ele = event.target;

      let elementTagName;
      let elementType;
      let elementRole;
      let elementId;
      let elementName;
      let elementTitle;
      let elementAlt;
      let elementClassName;

      let elementContent;
      let elementUrl;

      function setElementBaseInfo(element) {
        elementTagName = element.tagName.toUpperCase() || undefined;
        elementType = element.type || undefined;
        elementRole = element.role || undefined;
        elementId = element.id || undefined;
        elementName = element.name || undefined;
        elementTitle = element.title || undefined;
        elementAlt = element.alt || undefined;
        elementClassName = element.className || undefined;
      }

      function tryMatchElement() {
        if (isTag(ele, 'TEXTAREA')) {
          setElementBaseInfo(ele);
          return ele;
        }

        if (isTag(ele, 'SELECT')) {
          setElementBaseInfo(ele);
          try {
            elementContent = ele
              .querySelector('option[value="' + ele.value + '"]')
              .innerText.trim();
          } catch (err) {
            //
          }
          return ele;
        }

        if (isTag(ele, 'INPUT')) {
          setElementBaseInfo(ele);

          const type = ele.type;
          if (type === 'button' || type === 'reset' || type === 'submit') {
            elementContent = ele.value;
          }

          return ele;
        }

        const anchor = findTagParent(ele, 'A');
        if (anchor) {
          setElementBaseInfo(anchor);
          elementContent = anchor.innerText.trim() || undefined;
          elementUrl = anchor.href || undefined;
          return anchor;
        }

        const button = findTagParent(ele, 'BUTTON');
        if (button) {
          setElementBaseInfo(button);
          elementContent = button.innerText.trim() || undefined;
          return button;
        }
      }

      function report(targetElement) {
        const getAttr = targetElement.getAttribute.bind(targetElement);
        const eventName = getAttr(eventNameAttribute) || 'full-click';
        const eventData = {
          'element-tag-name': elementTagName || undefined,
          'element-type': elementType || undefined,
          'element-role': elementRole || undefined,
          'element-id': elementId || undefined,
          'element-name': elementName || undefined,
          'element-title': elementTitle || undefined,
          'element-alt': elementAlt || undefined,
          'element-class-name': elementClassName || undefined,
          'element-content': elementContent || undefined,
          'element-url': elementUrl || undefined,
        };
        targetElement.getAttributeNames().forEach(name => {
          const match = name.match(eventRegex);
          if (match) {
            eventData[match[1]] = getAttr(name);
          }
        });
        track(eventName, eventData);
      }

      const target = tryMatchElement();
      if (target != null) {
        report(target);
      }
    }

    document.addEventListener('click', handleFullClick, true);
  };

  const observeTitle = () => {
    const callback = ([entry]) => {
      title = entry && entry.target ? entry.target.text : undefined;
    };

    const observer = new MutationObserver(callback);

    const node = document.querySelector('head > title');

    if (node) {
      observer.observe(node, {
        subtree: true,
        characterData: true,
        childList: true,
      });
    }
  };

  const send = (payload, type = 'event') => {
    if (trackingDisabled()) return;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (typeof cache !== 'undefined') {
      headers['x-umami-cache'] = cache;
    }
    return fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ type, payload }),
      headers,
    })
      .then(res => res.text())
      .then(text => (cache = text))
      .catch(() => {}); // no-op, gulp error
  };

  const track = (obj, data) => {
    if (typeof obj === 'string') {
      const payload = getPayload();
      const payloadData = {
        ...(payload.data || {}),
        ...(typeof data === 'object' ? data : {}),
      };
      return send({
        ...payload,
        name: obj,
        data: Object.keys(payloadData).length === 0 ? undefined : payloadData,
      });
    } else if (typeof obj === 'object') {
      return send(obj);
    } else if (typeof obj === 'function') {
      return send(obj(getPayload()));
    }
    return send(getPayload());
  };

  const identify = data => send({ ...getPayload(), data }, 'identify');

  /* Start */

  if (!window.umami) {
    window.umami = {
      track,
      identify,
    };
  }

  let currentUrl = `${pathname}${search}`;
  let currentRef = document.referrer;
  let title = document.title;
  let cache;
  let initialized;

  if (autoTrack && !trackingDisabled()) {
    history.pushState = hook(history, 'pushState', handlePush);
    history.replaceState = hook(history, 'replaceState', handlePush);
    handleClick();
    observeTitle();

    const init = () => {
      if (document.readyState === 'complete' && !initialized) {
        track();
        initialized = true;
      }
    };

    document.addEventListener('readystatechange', init, true);

    init();
  }
})(window);
