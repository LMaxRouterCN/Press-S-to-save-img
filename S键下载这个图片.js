// ==UserScript==
// @name         S键下载这个图片
// @namespace    http://tampermonkey.net/
// @version      3.8
// @description  按 S 键下载当前鼠标悬浮的图片
// @author       LMaxRouter
// @match        *://*/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @homepageURL  https://github.com/LMaxRouterCN/Press-S-to-save-img
// @updateURL    https://github.com/LMaxRouterCN/Press-S-to-save-img/edit/main/S%E9%94%AE%E4%B8%8B%E8%BD%BD%E8%BF%99%E4%B8%AA%E5%9B%BE%E7%89%87.js
// @downloadURL  https://github.com/LMaxRouterCN/Press-S-to-save-img/edit/main/S%E9%94%AE%E4%B8%8B%E8%BD%BD%E8%BF%99%E4%B8%AA%E5%9B%BE%E7%89%87.js
// ==/UserScript==

(function() {
    'use strict';

    // 配置选项
    const config = {
        downloadKey: 'S',              // 触发下载的按键
        maxRetry: 3,                   // 最大重试次数
        timeout: 10000,                // 请求超时时间（毫秒）
        highlightColor: '#ff5252',     // 高亮边框颜色
        highlightWidth: 3,             // 边框宽度（像素）
        highlightDuration: 10,          // 边框显示时间（毫秒）
        fadeInDuration: 500,           // 淡入时间（毫秒）
        fadeOutDuration: 500,          // 淡出时间（毫秒）
        showTitleInNotification: true, // 通知中显示图片标题
        copyToClipboard: false,        // 复制图片到剪贴板
        debug: false                   // 调试模式
    };

    // 状态变量
    let lastMouseX = 0;
    let lastMouseY = 0;
    const activeHighlights = new Map(); // 存储活动的边框效果

    // 加载保存的设置
    function loadConfig() {
        const savedConfig = GM_getValue('imageDownloaderConfig');
        if (savedConfig) {
            Object.assign(config, savedConfig);
        }
    }

    // 保存设置
    function saveConfig() {
        GM_setValue('imageDownloaderConfig', config);
    }

    // 初始化加载配置
    loadConfig();

    // 添加全局样式
    const style = document.createElement('style');
    style.textContent = `
        .image-downloader-highlight-overlay {
            position: absolute;
            box-sizing: border-box;
            pointer-events: none;
            z-index: 999999;
            border-style: solid;
            border-radius: 3px;
            opacity: 0;
            animation: fade-in ${config.fadeInDuration}ms forwards;
        }

        @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .image-downloader-highlight-overlay.fade-out {
            animation: fade-out ${config.fadeOutDuration}ms forwards;
        }

        @keyframes fade-out {
            from { opacity: 1; }
            to { opacity: 0; }
        }

        .image-downloader-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 5px 25px rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            z-index: 100000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            max-width: min(600px, 90vw);
            word-break: break-word;
        }

        .image-downloader-notification.show {
            opacity: 1;
            transform: translateX(0);
        }

        .image-downloader-notification-icon {
            margin-right: 12px;
            font-size: 20px;
            min-width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .image-downloader-notification.downloading .image-downloader-notification-icon {
            background: rgba(33, 150, 243, 0.2);
            color: #2196F3;
        }

        .image-downloader-notification.success .image-downloader-notification-icon {
            background: rgba(76, 175, 80, 0.2);
            color: #4CAF50;
        }

        .image-downloader-notification.error .image-downloader-notification-icon {
            background: rgba(244, 67, 54, 0.2);
            color: #F44336;
        }

        .image-downloader-notification-content {
            flex: 1;
            min-width: 0;
        }

        .image-downloader-notification-title {
            font-weight: bold;
            margin-bottom: 5px;
            font-size: 16px;
        }

        .image-downloader-notification-filename {
            display: block;
            font-size: 13px;
            opacity: 0.9;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .image-downloader-settings-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1e1e2d;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 50px rgba(0, 0, 0, 0.7);
            z-index: 200000;
            width: 90%;
            max-width: 500px;
            color: #fff;
            font-family: Arial, sans-serif;
            border: 1px solid #43434f;
        }

        .image-downloader-settings-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            z-index: 199999;
            backdrop-filter: blur(5px);
        }

        .image-downloader-settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 1px solid #43434f;
        }

        .image-downloader-settings-title {
            font-size: 22px;
            font-weight: bold;
            color: #ff5252;
        }

        .image-downloader-settings-close {
            background: none;
            border: none;
            color: #fff;
            font-size: 24px;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.3s;
        }

        .image-downloader-settings-close:hover {
            opacity: 1;
        }

        .image-downloader-settings-group {
            margin-bottom: 20px;
        }

        .image-downloader-settings-label {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
            padding: 10px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            transition: background 0.3s;
        }

        .image-downloader-settings-label:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .image-downloader-settings-label-text {
            flex: 1;
            margin-left: 15px;
            font-size: 16px;
        }

        .image-downloader-settings-input {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid #43434f;
            border-radius: 6px;
            color: #fff;
            padding: 8px 12px;
            font-size: 16px;
            width: 100px;
            text-align: center;
        }

        .image-downloader-settings-input.color {
            width: 60px;
            height: 36px;
            padding: 2px;
            cursor: pointer;
        }

        .image-downloader-settings-input::placeholder {
            color: #aaa;
        }

        .image-downloader-settings-switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 26px;
        }

        .image-downloader-settings-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .image-downloader-settings-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #43434f;
            transition: .4s;
            border-radius: 34px;
        }

        .image-downloader-settings-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }

        input:checked + .image-downloader-settings-slider {
            background-color: #ff5252;
        }

        input:checked + .image-downloader-settings-slider:before {
            transform: translateX(24px);
        }

        .image-downloader-settings-footer {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
        }

        .image-downloader-settings-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            background: #ff5252;
            color: white;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.3s;
        }

        .image-downloader-settings-btn:hover {
            background: #ff6b6b;
        }

        .image-downloader-settings-row {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
            padding: 10px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            transition: background 0.3s;
        }

        .image-downloader-settings-row:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .image-downloader-settings-row-label {
            flex: 1;
            font-size: 16px;
        }

        .image-downloader-settings-row-value {
            display: flex;
            gap: 10px;
        }
    `;
    document.head.appendChild(style);

    // 打开设置面板
    function openSettingsPanel() {
        if (document.querySelector('.image-downloader-settings-panel')) return;

        const backdrop = document.createElement('div');
        backdrop.className = 'image-downloader-settings-backdrop';
        backdrop.onclick = closeSettingsPanel;

        const panel = document.createElement('div');
        panel.className = 'image-downloader-settings-panel';
        panel.innerHTML = `
            <div class="image-downloader-settings-header">
                <div class="image-downloader-settings-title">图片下载器设置</div>
                <button class="image-downloader-settings-close">&times;</button>
            </div>
            <div class="image-downloader-settings-group">
                <div class="image-downloader-settings-row">
                    <div class="image-downloader-settings-row-label">触发下载的按键</div>
                    <div class="image-downloader-settings-row-value">
                        <input type="text" class="image-downloader-settings-input" id="image-downloader-download-key" value="${config.downloadKey}" maxlength="1">
                    </div>
                </div>
                <div class="image-downloader-settings-row">
                    <div class="image-downloader-settings-row-label">最大重试次数</div>
                    <div class="image-downloader-settings-row-value">
                        <input type="number" class="image-downloader-settings-input" id="image-downloader-max-retry" value="${config.maxRetry}" min="1" max="10">
                    </div>
                </div>
                <div class="image-downloader-settings-row">
                    <div class="image-downloader-settings-row-label">请求超时时间 (毫秒)</div>
                    <div class="image-downloader-settings-row-value">
                        <input type="number" class="image-downloader-settings-input" id="image-downloader-timeout" value="${config.timeout}" min="1000" max="30000">
                    </div>
                </div>
                <div class="image-downloader-settings-row">
                    <div class="image-downloader-settings-row-label">高亮边框颜色</div>
                    <div class="image-downloader-settings-row-value">
                        <input type="color" class="image-downloader-settings-input color" id="image-downloader-highlight-color" value="${config.highlightColor}">
                    </div>
                </div>
                <div class="image-downloader-settings-row">
                    <div class="image-downloader-settings-row-label">边框宽度 (像素)</div>
                    <div class="image-downloader-settings-row-value">
                        <input type="number" class="image-downloader-settings-input" id="image-downloader-highlight-width" value="${config.highlightWidth}" min="1" max="10">
                    </div>
                </div>
                <div class="image-downloader-settings-row">
                    <div class="image-downloader-settings-row-label">边框显示时间 (毫秒)</div>
                    <div class="image-downloader-settings-row-value">
                        <input type="number" class="image-downloader-settings-input" id="image-downloader-highlight-duration" value="${config.highlightDuration}" min="1000" max="10000">
                    </div>
                </div>
                <div class="image-downloader-settings-row">
                    <div class="image-downloader-settings-row-label">淡入时间 (毫秒)</div>
                    <div class="image-downloader-settings-row-value">
                        <input type="number" class="image-downloader-settings-input" id="image-downloader-fade-in-duration" value="${config.fadeInDuration}" min="100" max="3000">
                    </div>
                </div>
                <div class="image-downloader-settings-row">
                    <div class="image-downloader-settings-row-label">淡出时间 (毫秒)</div>
                    <div class="image-downloader-settings-row-value">
                        <input type="number" class="image-downloader-settings-input" id="image-downloader-fade-out-duration" value="${config.fadeOutDuration}" min="100" max="3000">
                    </div>
                </div>
                <label class="image-downloader-settings-label">
                    <span class="image-downloader-settings-switch">
                        <input type="checkbox" id="image-downloader-show-title" ${config.showTitleInNotification ? 'checked' : ''}>
                        <span class="image-downloader-settings-slider"></span>
                    </span>
                    <div class="image-downloader-settings-label-text">在通知中显示图片标题</div>
                </label>
                <label class="image-downloader-settings-label">
                    <span class="image-downloader-settings-switch">
                        <input type="checkbox" id="image-downloader-copy-to-clipboard" ${config.copyToClipboard ? 'checked' : ''}>
                        <span class="image-downloader-settings-slider"></span>
                    </span>
                    <div class="image-downloader-settings-label-text">复制图片到剪贴板</div>
                </label>
                <label class="image-downloader-settings-label">
                    <span class="image-downloader-settings-switch">
                        <input type="checkbox" id="image-downloader-debug" ${config.debug ? 'checked' : ''}>
                        <span class="image-downloader-settings-slider"></span>
                    </span>
                    <div class="image-downloader-settings-label-text">启用调试模式</div>
                </label>
            </div>
            <div class="image-downloader-settings-footer">
                <button class="image-downloader-settings-btn" id="image-downloader-save-settings">保存设置</button>
            </div>
        `;

        panel.querySelector('.image-downloader-settings-close').onclick = closeSettingsPanel;
        panel.querySelector('#image-downloader-save-settings').onclick = saveSettings;

        document.body.appendChild(backdrop);
        document.body.appendChild(panel);
    }

    // 关闭设置面板
    function closeSettingsPanel() {
        const backdrop = document.querySelector('.image-downloader-settings-backdrop');
        const panel = document.querySelector('.image-downloader-settings-panel');
        if (backdrop) backdrop.remove();
        if (panel) panel.remove();
    }

    // 保存设置
    function saveSettings() {
        config.downloadKey = document.getElementById('image-downloader-download-key').value || 'S';
        config.maxRetry = parseInt(document.getElementById('image-downloader-max-retry').value) || 3;
        config.timeout = parseInt(document.getElementById('image-downloader-timeout').value) || 10000;
        config.highlightColor = document.getElementById('image-downloader-highlight-color').value || '#ff5252';
        config.highlightWidth = parseInt(document.getElementById('image-downloader-highlight-width').value) || 3;
        config.highlightDuration = parseInt(document.getElementById('image-downloader-highlight-duration').value) || 3000;
        config.fadeInDuration = parseInt(document.getElementById('image-downloader-fade-in-duration').value) || 500;
        config.fadeOutDuration = parseInt(document.getElementById('image-downloader-fade-out-duration').value) || 500;
        config.showTitleInNotification = document.getElementById('image-downloader-show-title').checked;
        config.copyToClipboard = document.getElementById('image-downloader-copy-to-clipboard').checked;
        config.debug = document.getElementById('image-downloader-debug').checked;

        saveConfig();
        closeSettingsPanel();
        showNotification('success', '设置已保存', '您的偏好设置已成功保存');
    }

    // 记录鼠标位置
    document.addEventListener('mousemove', function(event) {
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
    }, true);

    // 监听键盘事件
    document.addEventListener('keydown', function(event) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
        if (event.key.toUpperCase() === config.downloadKey.toUpperCase()) {
            handleImageDownload();
        }
    }, true);

    // 创建通知容器
    function createNotificationContainer() {
        const container = document.createElement('div');
        container.id = 'image-downloader-notification-container';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '100000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
        return container;
    }

    // 获取通知容器
    function getNotificationContainer() {
        let container = document.getElementById('image-downloader-notification-container');
        if (!container) container = createNotificationContainer();
        return container;
    }

    // 显示通知
    function showNotification(status, title, filename) {
        const container = getNotificationContainer();
        const notification = document.createElement('div');
        notification.className = `image-downloader-notification ${status}`;

        let icon = '';
        let statusText = '';
        switch(status) {
            case 'downloading': icon = '⏳'; statusText = '开始下载'; break;
            case 'success': icon = '✅'; statusText = '下载完成'; break;
            case 'error': icon = '❌'; statusText = '下载失败'; break;
        }

        const displayTitle = config.showTitleInNotification ? title : '图片';
        notification.innerHTML = `
            <div class="image-downloader-notification-icon">${icon}</div>
            <div class="image-downloader-notification-content">
                <div class="image-downloader-notification-title">${statusText}: ${displayTitle}</div>
                <div class="image-downloader-notification-filename" title="${filename}">${truncateLongFilename(filename)}</div>
            </div>
        `;

        container.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, status === 'error' ? 5000 : 3000);
    }

    // 截断过长的文件名
    function truncateLongFilename(filename) {
        const maxLength = 50;
        if (filename.length <= maxLength) return filename;
        const ellipsis = '...';
        const extMatch = filename.match(/\.\w+$/);
        const extension = extMatch ? extMatch[0] : '';
        const baseName = extMatch ? filename.slice(0, -extension.length) : filename;
        const charsToKeep = maxLength - extension.length - ellipsis.length;
        return baseName.substring(0, charsToKeep) + ellipsis + extension;
    }

    // 高亮图片元素
    function highlightImageElement(element, id) {
        const rect = element.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (rect.width === 0 || rect.height === 0) return null;

        const overlay = document.createElement('div');
        overlay.className = 'image-downloader-highlight-overlay';
        overlay.dataset.highlightId = id;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.left = `${rect.left + scrollLeft}px`;
        overlay.style.top = `${rect.top + scrollTop}px`;
        overlay.style.borderColor = config.highlightColor;
        overlay.style.borderWidth = `${config.highlightWidth}px`;

        document.body.appendChild(overlay);
        activeHighlights.set(id, overlay);
        return overlay;
    }

    // 移除高亮效果
    function removeHighlight(id) {
        if (!activeHighlights.has(id)) return;
        const overlay = activeHighlights.get(id);
        overlay.classList.add('fade-out');
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            activeHighlights.delete(id);
        }, config.fadeOutDuration);
    }

    // 处理图片下载
    async function handleImageDownload() {
        let imgElement = null;
        let filename = '';
        let title = '';
        const highlightId = Date.now().toString();

        try {
            const element = document.elementFromPoint(lastMouseX, lastMouseY);
            if (!element) return;
            imgElement = findImageElement(element);
            if (!imgElement) return;

            highlightImageElement(imgElement, highlightId);
            const imageUrl = await getImageUrl(imgElement);
            if (!imageUrl) return;

            filename = generateFilename(imageUrl);
            title = getImageTitle(imgElement);
            showNotification('downloading', title, filename);

            // 增强下载逻辑
            const blob = await downloadWithRetry(imageUrl, filename, title);
            if (!blob.type) return;
            filename = regenerateFilenameWithBlobType(filename, blob.type);

            // 下载到本地
            const blobUrl = URL.createObjectURL(blob);
            GM_download({
                url: blobUrl,
                name: filename,
                saveAs: true,
                onload: () => URL.revokeObjectURL(blobUrl),
                onerror: (e) => {
                    URL.revokeObjectURL(blobUrl);
                    throw new Error('下载失败: ' + (e.error || '未知错误') + ` - ${title} ${filename}`);
                }
            });

            showNotification('success', title, filename);

            // 如果开启了复制到剪贴板功能
            if (config.copyToClipboard && blob) {
                await copyImageToClipboard(blob);
                GM_notification({
                    text: `图片已复制到剪贴板: ${truncateLongFilename(filename)}`,
                    title: '图片下载器',
                    timeout: 3000,
                    highlight: true
                });
            }
        } catch (error) {
            logError('下载过程中出错:', error);
            showNotification('error', title || '图片', filename || '未知文件');
        } finally {
            setTimeout(() => removeHighlight(highlightId), config.highlightDuration);
        }
    }

    // 关键修复：根据图片真实类型重新生成文件名
    function regenerateFilenameWithBlobType(filename, contentType) {
        if (!contentType || !contentType.startsWith('image/')) return filename;

        const extMatch = filename.match(/\.\w+$/);
        const currentExt = extMatch ? extMatch[0].slice(1) : '';
        const newExt = contentType.split('/')[1];

        // 特殊处理：contentType可能包含后缀如 "image/webp"
        if (newExt && (newExt.toLowerCase() !== currentExt.toLowerCase())) {
            const cleanFilename = filename.replace(/\.\w+$/, '');
            // 替换部分特殊后缀
            const extMap = {
                'jpeg': 'jpg',
                'svg+xml': 'svg',
                'x-icon': 'ico'
            };
            const finalExt = extMap[newExt] || newExt;
            return `${cleanFilename}.${finalExt}`;
        }
        return filename;
    }

    // 增强下载逻辑（带重试机制）
    async function downloadWithRetry(url, filename, title) {
        let retryCount = 0;
        let blob = null;
        while (retryCount < config.maxRetry) {
            try {
                blob = await downloadImage(url, filename, title);
                return blob;
            } catch (error) {
                retryCount++;
                logError(`下载失败 重试中 (${retryCount}/${config.maxRetry})`, error);
                if (retryCount >= config.maxRetry) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount)));
            }
        }
    }

    // 查找图片元素
    function findImageElement(startElement) {
        let currentElement = startElement;
        while (currentElement && currentElement !== document.body) {
            if (isImageElement(currentElement)) return currentElement;
            if (isVideoElement(currentElement)) return currentElement; // 特殊处理视频封面
            currentElement = currentElement.parentElement;
        }
        return findBackgroundImageElement(startElement);
    }

    // 获取图片标题
    function getImageTitle(element) {
        const attributes = ['alt', 'title', 'aria-label'];
        for (const attr of attributes) {
            if (element.hasAttribute(attr)) {
                const value = element.getAttribute(attr);
                if (value && value.trim() !== '') {
                    return value.length > 30 ? value.substring(0, 30) + '...' : value;
                }
            }
        }

        // B站特殊处理：尝试获取视频标题
        if (element.tagName === 'VIDEO') {
            const container = element.closest('.bilibili-player-video, .video-content');
            if (container) {
                const titleElem = container.querySelector('.video-title, .video-title-style');
                if (titleElem && titleElem.textContent) {
                    const title = titleElem.textContent.trim();
                    return title.length > 30 ? title.substring(0, 30) + '...' : title;
                }
            }
        }

        return '图片';
    }

    // 判断元素是否是图片元素
    function isImageElement(element) {
        return ['IMG', 'svg', 'image', 'CANVAS', 'FIGURE', 'DIV'].includes(element.tagName);
    }

    // 特殊处理视频元素封面
    function isVideoElement(element) {
        if (element.tagName !== 'VIDEO') return false;
        const poster = element.getAttribute('poster');
        return poster && poster.trim() !== '';
    }

    // 查找背景图片元素
    function findBackgroundImageElement(element) {
        const style = getComputedStyle(element);
        return (style.backgroundImage && style.backgroundImage !== 'none') ? element : null;
    }

    // 获取图片URL
    async function getImageUrl(imgElement) {
        switch (imgElement.tagName) {
            case 'IMG': return getImgElementUrl(imgElement);
            case 'CANVAS': return getCanvasUrl(imgElement);
            case 'svg': case 'image': return getSvgUrl(imgElement);
            case 'VIDEO': return imgElement.getAttribute('poster'); // 获取视频封面
            default: return getBackgroundImageUrl(imgElement);
        }
    }

    // B站封面特殊处理 - 修复宽度1000限制问题
    function normalizeBilibiliUrl(url) {
        // 处理带签名的URL：移除所有查询参数以获取高清原图
        if (/bilibili\.com/.test(window.location.host) &&
            /\.(jpg|jpeg|png|webp|gif)$/i.test(url)) {
            const cleanUrl = new URL(url, location.href);

            // 移除所有查询参数（大小参数等）
            cleanUrl.search = '';
            return cleanUrl.toString();
        }
        return url;
    }

    // 获取IMG元素的URL - B站封面专门处理
function getImgElementUrl(img) {
    let url = img.currentSrc || img.src || '';

    // 尝试从 lazyload 属性中获取 URL
    const lazyAttrs = ['data-src', 'data-original', 'data-srcset', 'data-lazy-src', 'data-url'];
    for (const attr of lazyAttrs) {
        if (img.hasAttribute(attr)) {
            const val = img.getAttribute(attr);
            if (val && val.trim()) {
                url = val;
                break;
            }
        }
    }

    // 如果是 B 站封面图，进行特殊处理（移除@参数，改为高清原图）
    if (url.includes('bfs') && /\.(jpg|png|webp)(@|$)/.test(url)) {
        url = url.split('@')[0];           // 移除@后缀
        url = url.replace(/\.webp$/, '.jpg'); // 转换格式为 jpg
    }

    return resolveUrl(url);
}


    // 获取Canvas元素的URL
    function getCanvasUrl(canvas) {
        try {
            return canvas.toDataURL('image/png');
        } catch (e) {
            logError('无法获取Canvas数据:', e);
            return null;
        }
    }

    // 获取SVG元素的URL
    function getSvgUrl(svgElement) {
        try {
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
            return URL.createObjectURL(svgBlob);
        } catch (e) {
            logError('无法获取SVG数据:', e);
            return null;
        }
    }

    // 获取背景图片URL
    function getBackgroundImageUrl(element) {
        const style = getComputedStyle(element);
        const backgroundImage = style.backgroundImage;
        const urlMatch = backgroundImage.match(/url$$["']?([^"')]*)["']?$$/);
        return urlMatch && urlMatch[1] ? resolveUrl(urlMatch[1].replace(/["']/g, '')) : null;
    }

    // 解析URL
    function resolveUrl(url) {
        try {
            return new URL(url, window.location.href).href;
        } catch (e) {
            return url;
        }
    }

    // 下载图片并返回blob
    async function downloadImage(url, filename, title) {
        return new Promise((resolve, reject) => {
            // B站特殊处理：移除图片URL签名等限制参数
            url = normalizeBilibiliUrl(url);

            if (url.startsWith('blob:')) {
                downloadBlobUrlToBlob(url, resolve, reject);
            } else if (url.startsWith('data:')) {
                resolve(dataURLToBlob(url));
            } else {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
                        "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*",
                        "Referer": window.location.href
                    },
                    timeout: config.timeout,
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(response.response);
                        } else {
                            reject(new Error(`HTTP错误: ${response.status} ${url}`));
                        }
                    },
                    onerror: function(error) {
                        reject(new Error(`网络错误: ${error} ${url}`));
                    },
                    ontimeout: function() {
                        reject(new Error(`请求超时: ${url}`));
                    }
                });
            }
        });
    }

    // 将Data URL转换为Blob
    function dataURLToBlob(dataURL) {
        const [header, data] = dataURL.split(',');
        const mediaType = header.match(/:(.*?);/)[1];
        const binary = atob(data);
        const array = [];
        for (let i = 0; i < binary.length; i++) {
            array.push(binary.charCodeAt(i));
        }
        return new Blob([new Uint8Array(array)], {type: mediaType});
    }

    // 下载Blob URL并返回Blob
    function downloadBlobUrlToBlob(blobUrl, resolve, reject) {
        fetch(blobUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误: ${response.status}`);
                }
                return response.blob();
            })
            .then(resolve)
            .catch(reject);
    }

    // 将图片复制到剪贴板
    async function copyImageToClipboard(blob) {
        try {
            return navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);
        } catch (err) {
            logError('无法复制图片:', err);
            throw new Error('复制失败: ' + err.message);
        }
    }

    // 生成文件名
    function generateFilename(url) {
        try {
            // 清理URL参数（避免签名参数影响）
            const cleanUrl = url.split('?')[0];
            const urlObj = new URL(cleanUrl);
            const pathParts = urlObj.pathname.split('/').filter(part => part !== '');

            let filename = 'image';
            if (pathParts.length > 0) {
                const lastPart = pathParts[pathParts.length - 1];
                filename = lastPart.split('.')[0] || filename;

                // 移除不需要的字符
                filename = filename.replace(/[^\w\-]/g, '_');
            }

            // 支持WebP格式
            const extension = /\.webp(\?.*)?$/.test(url) ? 'webp' :
                             /\.svg(\?.*)?$/i.test(url) ? 'svg' :
                             /\.jpeg|\.jpg(\?.*)?$/i.test(url) ? 'jpg' :
                             /\.png(\?.*)?$/i.test(url) ? 'png' : 'png';

            const timestamp = new Date().toISOString()
                .replace(/[:.]/g, '-')
                .split('T')
                .join('_')
                .substring(0, 19);

            return `${filename}_${timestamp}.${extension}`;
        } catch (e) {
            return `image_${Date.now()}.png`;
        }
    }

    // 错误日志
    function logError(message, error) {
        if (config.debug) {
            console.error(`[图片下载器] ${message}`, error);

            // 显示详细的错误通知
            const errorDetail = `${error.message || error}`.substring(0, 100);
            GM_notification({
                text: `错误: ${errorDetail}`,
                title: '图片下载器调试',
                timeout: 5000,
                highlight: false
            });
        }
    }

    // 初始化
    console.log('[图片下载器] 已加载 (v3.8) - 悬停图片并按 S 键下载');
    console.log('[图片下载器] B站封面高清下载已修复');
    console.log('[图片下载器] 支持快速连续下载多个图片');

    GM_registerMenuCommand('图片下载器设置', openSettingsPanel);
})();
