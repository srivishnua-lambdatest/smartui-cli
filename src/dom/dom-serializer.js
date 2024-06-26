(function() {
  (function (exports) {
    'use strict';

    const process = (typeof globalThis !== "undefined" && globalThis.process) || {};
    process.env = process.env || {};
    process.env.__SMARTUI_BROWSERIFIED__ = true;

    // Translates JavaScript properties of inputs into DOM attributes.
    function serializeInputElements(_ref) {
      let {
        dom,
        clone,
        warnings
      } = _ref;
      for (let elem of dom.querySelectorAll('input, textarea, select')) {
        let inputId = elem.getAttribute('data-smartui-element-id');
        let cloneEl = clone.querySelector(`[data-smartui-element-id="${inputId}"]`);
        switch (elem.type) {
          case 'checkbox':
          case 'radio':
            if (elem.checked) {
              cloneEl.setAttribute('checked', '');
            }
            break;
          case 'select-one':
            if (elem.selectedIndex !== -1) {
              cloneEl.options[elem.selectedIndex].setAttribute('selected', 'true');
            }
            break;
          case 'select-multiple':
            for (let option of elem.selectedOptions) {
              cloneEl.options[option.index].setAttribute('selected', 'true');
            }
            break;
          case 'textarea':
            cloneEl.innerHTML = elem.value;
            break;
          default:
            cloneEl.setAttribute('value', elem.value);
        }
      }
    }

    // Adds a `<base>` element to the serialized iframe's `<head>`. This is necessary when
    // embedded documents are serialized and their contents become root-relative.
    function setBaseURI(dom) {
      /* istanbul ignore if: sanity check */
      if (!new URL(dom.baseURI).hostname) return;
      let $base = document.createElement('base');
      $base.href = dom.baseURI;
      dom.querySelector('head').prepend($base);
    }

    // Recursively serializes iframe documents into srcdoc attributes.
    function serializeFrames(_ref) {
      let {
        dom,
        clone,
        warnings,
        resources,
        enableJavaScript,
        disableShadowDOM
      } = _ref;
      for (let frame of dom.querySelectorAll('iframe')) {
        var _clone$head;
        let smartuiElementId = frame.getAttribute('data-smartui-element-id');
        let cloneEl = clone.querySelector(`[data-smartui-element-id="${smartuiElementId}"]`);
        let builtWithJs = !frame.srcdoc && (!frame.src || frame.src.split(':')[0] === 'javascript');

        // delete frames within the head since they usually break pages when
        // rerendered and do not effect the visuals of a page
        if ((_clone$head = clone.head) !== null && _clone$head !== void 0 && _clone$head.contains(cloneEl)) {
          cloneEl.remove();

          // if the frame document is accessible and not empty, we can serialize it
        } else if (frame.contentDocument && frame.contentDocument.documentElement) {
          // js is enabled and this frame was built with js, don't serialize it
          if (enableJavaScript && builtWithJs) continue;

          // the frame has yet to load and wasn't built with js, it is unsafe to serialize
          if (!builtWithJs && !frame.contentWindow.performance.timing.loadEventEnd) continue;

          // recersively serialize contents
          let serialized = serializeDOM({
            domTransformation: setBaseURI,
            dom: frame.contentDocument,
            enableJavaScript,
            disableShadowDOM
          });

          // append serialized warnings and resources
          /* istanbul ignore next: warnings not implemented yet */
          // for (let w of serialized.warnings) warnings.add(w);
          // for (let r of serialized.resources) resources.add(r);

          // assign serialized html to srcdoc and remove src
          cloneEl.setAttribute('srcdoc', serialized.html);
          cloneEl.removeAttribute('src');

          // delete inaccessible frames built with js when js is disabled because they
          // break asset discovery by creating non-captured requests that hang
        } else if (!enableJavaScript && builtWithJs) {
          cloneEl.remove();
        }
      }
    }

    // Creates a resource object from an element's unique ID and data URL
    function resourceFromDataURL(uid, dataURL) {
      // split dataURL into desired parts
      let [data, content] = dataURL.split(',');
      let [, mimetype] = data.split(':');
      [mimetype] = mimetype.split(';');

      // build a URL for the serialized asset
      let [, ext] = mimetype.split('/');
      let path = `/__serialized__/${uid}.${ext}`;
      let url = rewriteLocalhostURL(new URL(path, document.URL).toString());

      // return the url, base64 content, and mimetype
      return {
        url,
        content,
        mimetype
      };
    }
    function resourceFromText(uid, mimetype, data) {
      // build a URL for the serialized asset
      let [, ext] = mimetype.split('/');
      let path = `/__serialized__/${uid}.${ext}`;
      let url = rewriteLocalhostURL(new URL(path, document.URL).toString());
      // return the url, text content, and mimetype
      return {
        url,
        content: data,
        mimetype
      };
    }
    function styleSheetFromNode(node) {
      /* istanbul ignore if: sanity check */
      if (node.sheet) return node.sheet;

      // Cloned style nodes don't have a sheet instance unless they are within
      // a document; we get it by temporarily adding the rules to DOM
      const tempStyle = node.cloneNode();
      tempStyle.setAttribute('data-smartui-style-helper', '');
      tempStyle.innerHTML = node.innerHTML;
      const clone = document.cloneNode();
      clone.appendChild(tempStyle);
      const sheet = tempStyle.sheet;
      // Cleanup node
      tempStyle.remove();
      return sheet;
    }
    function rewriteLocalhostURL(url) {
      return url.replace(/(http[s]{0,1}:\/\/)localhost[:\d+]*/, '$1render.smartui.local');
    }

    // Returns a mostly random uid.
    function uid() {
      return `_${Math.random().toString(36).substr(2, 9)}`;
    }
    function markElement(domElement, disableShadowDOM) {
      var _domElement$tagName;
      // Mark elements that are to be serialized later with a data attribute.
      if (['input', 'textarea', 'select', 'iframe', 'canvas', 'video', 'style'].includes((_domElement$tagName = domElement.tagName) === null || _domElement$tagName === void 0 ? void 0 : _domElement$tagName.toLowerCase())) {
        if (!domElement.getAttribute('data-smartui-element-id')) {
          domElement.setAttribute('data-smartui-element-id', uid());
        }
      }

      // add special marker for shadow host
      if (!disableShadowDOM && domElement.shadowRoot) {
        domElement.setAttribute('data-smartui-shadow-host', '');
        if (!domElement.getAttribute('data-smartui-element-id')) {
          domElement.setAttribute('data-smartui-element-id', uid());
        }
      }
    }

    // Returns true if a stylesheet is a CSSOM-based stylesheet.
    function isCSSOM(styleSheet) {
      // no href, has a rulesheet, and has an owner node
      return !styleSheet.href && styleSheet.cssRules && styleSheet.ownerNode;
    }

    // Returns false if any stylesheet rules do not match between two stylesheets
    function styleSheetsMatch(sheetA, sheetB) {
      for (let i = 0; i < sheetA.cssRules.length; i++) {
        var _sheetB$cssRules$i;
        let ruleA = sheetA.cssRules[i].cssText;
        let ruleB = (_sheetB$cssRules$i = sheetB.cssRules[i]) === null || _sheetB$cssRules$i === void 0 ? void 0 : _sheetB$cssRules$i.cssText;
        if (ruleA !== ruleB) return false;
      }
      return true;
    }
    function createStyleResource(styleSheet) {
      const styles = Array.from(styleSheet.cssRules).map(cssRule => cssRule.cssText).join('\n');
      let resource = resourceFromText(uid(), 'text/css', styles);
      return resource;
    }
    function serializeCSSOM(_ref) {
      let {
        dom,
        clone,
        resources,
        cache,
        warnings
      } = _ref;
      // in-memory CSSOM into their respective DOM nodes.
      for (let styleSheet of dom.styleSheets) {
        var _styleSheet$href;
        if (isCSSOM(styleSheet)) {
          let styleId = styleSheet.ownerNode.getAttribute('data-smartui-element-id');
          let cloneOwnerNode = clone.querySelector(`[data-smartui-element-id="${styleId}"]`);
          if (styleSheetsMatch(styleSheet, styleSheetFromNode(cloneOwnerNode))) continue;
          let style = document.createElement('style');
          style.type = 'text/css';
          style.setAttribute('data-smartui-element-id', styleId);
          style.setAttribute('data-smartui-cssom-serialized', 'true');
          style.innerHTML = Array.from(styleSheet.cssRules).map(cssRule => cssRule.cssText).join('\n');
          cloneOwnerNode.parentNode.insertBefore(style, cloneOwnerNode.nextSibling);
          cloneOwnerNode.remove();
        } else if ((_styleSheet$href = styleSheet.href) !== null && _styleSheet$href !== void 0 && _styleSheet$href.startsWith('blob:')) {
          const styleLink = document.createElement('link');
          styleLink.setAttribute('rel', 'stylesheet');
          let resource = createStyleResource(styleSheet);
          resources.add(resource);
          styleLink.setAttribute('data-smartui-blob-stylesheets-serialized', 'true');
          styleLink.setAttribute('data-smartui-serialized-attribute-href', resource.url);

          /* istanbul ignore next: tested, but coverage is stripped */
          if (clone.constructor.name === 'HTMLDocument' || clone.constructor.name === 'DocumentFragment') {
            // handle document and iframe
            clone.body.prepend(styleLink);
          } else if (clone.constructor.name === 'ShadowRoot') {
            clone.prepend(styleLink);
          }
        }
      }

      // clone Adopted Stylesheets
      // Regarding ordering of the adopted stylesheets - https://github.com/WICG/construct-stylesheets/issues/93
      /* istanbul ignore next: tested, but coverage is stripped */
      if (dom.adoptedStyleSheets) {
        for (let sheet of dom.adoptedStyleSheets) {
          const styleLink = document.createElement('link');
          styleLink.setAttribute('rel', 'stylesheet');
          if (!cache.has(sheet)) {
            let resource = createStyleResource(sheet);
            resources.add(resource);
            cache.set(sheet, resource.url);
          }
          styleLink.setAttribute('data-smartui-adopted-stylesheets-serialized', 'true');
          styleLink.setAttribute('data-smartui-serialized-attribute-href', cache.get(sheet));

          /* istanbul ignore next: tested, but coverage is stripped */
          if (clone.constructor.name === 'HTMLDocument' || clone.constructor.name === 'DocumentFragment') {
            // handle document and iframe
            clone.body.prepend(styleLink);
          } else if (clone.constructor.name === 'ShadowRoot') {
            clone.prepend(styleLink);
          }
        }
      } else {
        warnings.add('Skipping `adoptedStyleSheets` as it is not supported.');
      }
    }

    // Serialize in-memory canvas elements into images.
    function serializeCanvas(_ref) {
      let {
        dom,
        clone,
        resources
      } = _ref;
      for (let canvas of dom.querySelectorAll('canvas')) {
        // Note: the `.toDataURL` API requires WebGL canvas elements to use
        // `preserveDrawingBuffer: true`. This is because `.toDataURL` uses the
        // drawing buffer, which is cleared after each render for WebGL by default.
        let dataUrl = canvas.toDataURL();

        // skip empty canvases
        if (!dataUrl || dataUrl === 'data:,') continue;

        // get the element's smartui id and create a resource for it
        let smartuiElementId = canvas.getAttribute('data-smartui-element-id');
        // let resource = resourceFromDataURL(smartuiElementId, dataUrl);
        // resources.add(resource);

        // create an image element in the cloned dom
        let img = document.createElement('img');
        // use a data attribute to avoid making a real request
        // img.setAttribute('data-smartui-serialized-attribute-src', resource.url);
        img.setAttribute('src', dataUrl);

        // copy canvas element attributes to the image element such as style, class,
        // or data attributes that may be targeted by CSS
        for (let {
          name,
          value
        } of canvas.attributes) {
          img.setAttribute(name, value);
        }

        // mark the image as serialized (can be targeted by CSS)
        img.setAttribute('data-smartui-canvas-serialized', 'test');
        // set a default max width to account for canvases that might resize with JS
        img.style.maxWidth = img.style.maxWidth || '100%';

        // insert the image into the cloned DOM and remove the cloned canvas element
        let cloneEl = clone.querySelector(`[data-smartui-element-id=${smartuiElementId}]`);
        // `parentElement` for elements directly under shadow root is `null` -> Incase of Nested Shadow DOM.
        if (cloneEl.parentElement) {
          cloneEl.parentElement.insertBefore(img, cloneEl);
        } else {
          clone.insertBefore(img, cloneEl);
        }
        cloneEl.remove();
      }
    }

    // Captures the current frame of videos and sets the poster image
    function serializeVideos(_ref) {
      let {
        dom,
        clone,
        resources,
        warnings
      } = _ref;
      for (let video of dom.querySelectorAll('video')) {
        let videoId = video.getAttribute('data-smartui-element-id');
        let cloneEl = clone.querySelector(`[data-smartui-element-id="${videoId}"]`);

        // remove video sources
        cloneEl.removeAttribute('src');
        const sourceEls = cloneEl.querySelectorAll('source');
        if (sourceEls.length) sourceEls.forEach((sourceEl) => sourceEl.remove());
        
        // if the video doesn't have a poster image
        if (!video.getAttribute('poster')) {
          let canvas = document.createElement('canvas');
          let width = canvas.width = video.videoWidth;
          let height = canvas.height = video.videoHeight;
          let dataUrl;
          canvas.getContext('2d').drawImage(video, 0, 0, width, height);
          try {
            dataUrl = canvas.toDataURL();
          } catch (e) {
            warnings.add(`data-smartui-element-id="${videoId}" : ${e.toString()}`);
          }

          // if the canvas produces a blank image, skip
          if (!dataUrl || dataUrl === 'data:,') continue;

          // create a resource from the serialized data url
          let resource = resourceFromDataURL(videoId, dataUrl);
          resources.add(resource);

          // set poster attribute to resource url to avoid making a real request
          cloneEl.setAttribute('poster', resource.url);
        }
      }
    }

    // Drop loading attribute. We do not scroll page in discovery stage but we want to make sure that
    // all resources are requested, so we drop loading attribute [as it can be set to lazy]
    function dropLoadingAttribute(domElement) {
      var _domElement$tagName;
      if (!['img', 'iframe'].includes((_domElement$tagName = domElement.tagName) === null || _domElement$tagName === void 0 ? void 0 : _domElement$tagName.toLowerCase())) return;
      domElement.removeAttribute('loading');
    }

    // All transformations that we need to apply for a successful discovery and stable render
    function applyElementTransformations(domElement) {
      dropLoadingAttribute(domElement);
    }

    /**
     * Custom deep clone function that replaces SmartUI's current clone behavior.
     * This enables us to capture shadow DOM in snapshots. It takes advantage of `attachShadow`'s mode option set to open
     * https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow#parameters
     */

    /**
     * Deep clone a document while also preserving shadow roots
     * returns document fragment
     */

    const ignoreTags = ['NOSCRIPT'];
    function cloneNodeAndShadow(_ref) {
      let {
        dom,
        disableShadowDOM
      } = _ref;
      // clones shadow DOM and light DOM for a given node
      let cloneNode = (node, parent) => {
        let walkTree = (nextn, nextp) => {
          while (nextn) {
            if (!ignoreTags.includes(nextn.nodeName)) {
              cloneNode(nextn, nextp);
            }
            nextn = nextn.nextSibling;
          }
        };

        // mark the node before cloning
        markElement(node, disableShadowDOM);
        let clone = node.cloneNode();

        // We apply any element transformations here to avoid another treeWalk
        applyElementTransformations(clone);
        parent.appendChild(clone);

        // shallow clone should not contain children
        if (clone.children) {
          Array.from(clone.children).forEach(child => clone.removeChild(child));
        }

        // clone shadow DOM
        if (node.shadowRoot && !disableShadowDOM) {
          // create shadowRoot
          if (clone.shadowRoot) {
            // it may be set up in a custom element's constructor
            clone.shadowRoot.innerHTML = '';
          } else {
            clone.attachShadow({
              mode: 'open'
            });
          }
          // clone dom elements
          walkTree(node.shadowRoot.firstChild, clone.shadowRoot);
        }

        // clone light DOM
        walkTree(node.firstChild, clone);
      };
      let fragment = dom.createDocumentFragment();
      cloneNode(dom.documentElement, fragment);
      fragment.documentElement = fragment.firstChild;
      fragment.head = fragment.querySelector('head');
      fragment.body = fragment.querySelector('body');
      return fragment;
    }

    /**
     * Use `getInnerHTML()` to serialize shadow dom as <template> tags. `innerHTML` and `outerHTML` don't do this. Buzzword: "declarative shadow dom"
     */
    function getOuterHTML(docElement) {
      // firefox doesn't serialize shadow DOM, we're awaiting API's by firefox to become ready and are not polyfilling it.
      if (!docElement.getInnerHTML) {
        return docElement.outerHTML;
      }
      // chromium gives us declarative shadow DOM serialization API
      let innerHTML = docElement.getInnerHTML({
        includeShadowRoots: true
      });
      docElement.textContent = '';
      // Note: Here we are specifically passing replacer function to avoid any replacements due to
      // special characters in client's dom like $&
      return docElement.outerHTML.replace('</html>', () => `${innerHTML}</html>`);
    }

    // we inject declarative shadow dom polyfill to allow shadow dom to load in non chromium infrastructure browsers
    // Since only chromium currently supports declarative shadow DOM - https://caniuse.com/declarative-shadow-dom
    function injectDeclarativeShadowDOMPolyfill(ctx) {
      let clone = ctx.clone;
      let scriptEl = document.createElement('script');
      scriptEl.setAttribute('id', '__smartui_shadowdom_helper');
      scriptEl.setAttribute('data-smartui-injected', true);
      scriptEl.innerHTML = `
      function reversePolyFill(root=document){
        root.querySelectorAll('template[shadowroot]').forEach(template => {
          const mode = template.getAttribute('shadowroot');
          const shadowRoot = template.parentNode.attachShadow({ mode });
          shadowRoot.appendChild(template.content);
          template.remove();
        });

        root.querySelectorAll('[data-smartui-shadow-host]').forEach(shadowHost => reversePolyFill(shadowHost.shadowRoot));
      }

      if (["interactive", "complete"].includes(document.readyState)) {
        reversePolyFill();
      } else {
        document.addEventListener("DOMContentLoaded", () => reversePolyFill());
      }
    `.replace(/(\n|\s{2}|\t)/g, '');

      // run polyfill as first thing post dom content is loaded
      clone.head.prepend(scriptEl);
    }

    // Returns a copy or new doctype for a document.
    function doctype(dom) {
      let {
        name = 'html',
        publicId = '',
        systemId = ''
      } = (dom === null || dom === void 0 ? void 0 : dom.doctype) ?? {};
      let deprecated = '';
      if (publicId && systemId) {
        deprecated = ` PUBLIC "${publicId}" "${systemId}"`;
      } else if (publicId) {
        deprecated = ` PUBLIC "${publicId}"`;
      } else if (systemId) {
        deprecated = ` SYSTEM "${systemId}"`;
      }
      return `<!DOCTYPE ${name}${deprecated}>`;
    }

    // Serializes and returns the cloned DOM as an HTML string
    function serializeHTML(ctx) {
      let html = getOuterHTML(ctx.clone.documentElement);
      // replace serialized data attributes with real attributes
      html = html.replace(/ data-smartui-serialized-attribute-(\w+?)=/ig, ' $1=');
      // include the doctype with the html string
      return doctype(ctx.dom) + html;
    }
    function serializeElements(ctx) {
      serializeInputElements(ctx);
      serializeFrames(ctx);
      serializeVideos(ctx);
      if (!ctx.enableJavaScript) {
        serializeCSSOM(ctx);
        serializeCanvas(ctx);
      }
      for (const shadowHost of ctx.dom.querySelectorAll('[data-smartui-shadow-host]')) {
        let smartuiElementId = shadowHost.getAttribute('data-smartui-element-id');
        let cloneShadowHost = ctx.clone.querySelector(`[data-smartui-element-id="${smartuiElementId}"]`);
        if (shadowHost.shadowRoot && cloneShadowHost.shadowRoot) {
          serializeElements({
            ...ctx,
            dom: shadowHost.shadowRoot,
            clone: cloneShadowHost.shadowRoot
          });
        } else {
          ctx.warnings.add('data-smartui-shadow-host does not have shadowRoot');
        }
      }
    }

    // Serializes a document and returns the resulting DOM string.
    function serializeDOM(options) {
      let {
        dom = document,
        // allow snake_case or camelCase
        enableJavaScript = options === null || options === void 0 ? void 0 : options.enable_javascript,
        domTransformation = options === null || options === void 0 ? void 0 : options.dom_transformation,
        stringifyResponse = options === null || options === void 0 ? void 0 : options.stringify_response,
        disableShadowDOM = options === null || options === void 0 ? void 0 : options.disable_shadow_dom,
        reshuffleInvalidTags = options === null || options === void 0 ? void 0 : options.reshuffle_invalid_tags
      } = options || {};

      // keep certain records throughout serialization
      let ctx = {
        resources: new Set(),
        warnings: new Set(),
        hints: new Set(),
        cache: new Map(),
        enableJavaScript,
        disableShadowDOM
      };
      ctx.dom = dom;
      ctx.clone = cloneNodeAndShadow(ctx);
      serializeElements(ctx);
      setBaseURI(ctx.clone.documentElement);
      if (domTransformation) {
        try {
          // eslint-disable-next-line no-eval
          if (typeof domTransformation === 'string') domTransformation = window.eval(domTransformation);
          domTransformation(ctx.clone.documentElement);
        } catch (err) {
          let errorMessage = `Could not transform the dom: ${err.message}`;
          ctx.warnings.add(errorMessage);
          console.error(errorMessage);
        }
      }
      if (!disableShadowDOM) {
        injectDeclarativeShadowDOMPolyfill(ctx);
      }
      if (reshuffleInvalidTags) {
        let clonedBody = ctx.clone.body;
        while (clonedBody.nextSibling) {
          let sibling = clonedBody.nextSibling;
          clonedBody.append(sibling);
        }
      } else if (ctx.clone.body.nextSibling) {
        ctx.hints.add('DOM elements found outside </body>');
      }
      let result = {
        html: serializeHTML(ctx),
        warnings: Array.from(ctx.warnings),
        resources: Array.from(ctx.resources),
        hints: Array.from(ctx.hints)
      };
      return stringifyResponse ? JSON.stringify(result) : result;
    }

    exports["default"] = serializeDOM;
    exports.serialize = serializeDOM;
    exports.serializeDOM = serializeDOM;

    Object.defineProperty(exports, '__esModule', { value: true });

  })(this.SmartUIDOM = this.SmartUIDOM || {});
}).call(window);

if (typeof define === "function" && define.amd) {
  define("@smartui/dom", [], () => window.SmartUIDOM);
} else if (typeof module === "object" && module.exports) {
  module.exports = window.SmartUIDOM;
}
