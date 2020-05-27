'use strict'

/**
 * @typedef {Object} chrome
 * @property {*} tabs
 * @property {*} browserAction
 * @property {*} contextMenus
 */

const Service = function () {
  /**
   * Состояние вкладок.
   * Вынужден хранить tab.mutedInfo появится (c chrome 46)
   * @type {Array}
   */
  this.mutedTabs = []

  this.storage = chrome.storage.sync
  this.storageKeys = ['blockedHosts', 'blockedPages']

  this.blockedHosts = []
  this.blockedPages = []

  this.init()
}

Service.prototype.init = function () {
  this.loadStorage()
}

/**
 * Mute tab
 * @param {Object} tab
 * @param {boolean} mute
 */
Service.prototype.mute = function (tab, mute) {
  const id = tab.id
  let index

  if (mute) {
    this.mutedTabs.push(id)
  } else {
    index = this.mutedTabs.indexOf(id)

    if (index !== -1) {
      this.mutedTabs.splice(index, 1)
    }
  }

  chrome.tabs.update(tab.id, {muted: mute})
}

Service.prototype.isMuted = function (tab) {
  return this.mutedTabs.indexOf(tab.id) !== -1
}

Service.prototype.refreshIcon = function (tab) {
  let icon = 'images/icon-normal.png'

  if (this.isBlocked(tab.url)) {
    icon = 'images/icon-blocked.png'
  } else if (this.isMuted(tab)) {
    icon = 'images/icon-muted.png'
  }

  chrome.browserAction.setIcon({
    path: icon,
    tabId: tab.id
  })
}

Service.prototype.refreshContextMenu = function (tab) {
  // todo: i18n
  const blockHost = this.isHostBlocked(tab.url) ? 'Remove domain from blacklist' : 'Add domain to blacklist'
  const blockPage = this.isPageBlocked(tab.url) ? 'Remove page from blacklist' : 'Add page to blacklist'

  chrome.contextMenus.update('block-host', {title: blockHost})
  chrome.contextMenus.update('block-page', {title: blockPage})
}

/**
 * Add or remove url from block list
 * @param {Object} tab
 * @param {string} what
 * @param {string} action
 */
Service.prototype.block = function (tab, what, action) {
  const url = tab.url
  const field = this[what === 'host' ? 'blockedHosts' : 'blockedPages']
  const identifier = what === 'host' ? this.getHost(url) : this.getPage(url)
  let index

  if (action === 'add') {
    field.push(identifier)

    this.mute(tab, true)
  } else {
    index = field.indexOf(identifier)

    if (index !== -1) {
      field.splice(index, 1)
    }

    this.mute(tab, false)
  }

  this.saveStorage()
}

Service.prototype.isHostBlocked = function (url) {
  return this.blockedHosts.indexOf(this.getHost(url)) !== -1
}

Service.prototype.isPageBlocked = function (url) {
  return this.blockedPages.indexOf(this.getPage(url)) !== -1
}

Service.prototype.isBlocked = function (url) {
  return this.isHostBlocked(url) || this.isPageBlocked(url)
}

Service.prototype.loadStorage = function () {
  this.storage.get(this.storageKeys, (items) => {
    this.storageKeys.forEach((key) => {
      if (items[key]) {
        this[key] = items[key]
      }
    })
  })
}

Service.prototype.saveStorage = function () {
  const data = {}

  this.storageKeys.forEach((key) => {
    if (this[key]) {
      data[key] = this[key]
    }
  })

  this.storage.set(data)
}

Service.prototype.getHost = function (url) {
  const match = url.match(/^https?:\/\/(www\.)?([^\/:?#]+)(?:[\/:?#]|$)/i)
  return match && match[2]
}

Service.prototype.getPage = function (url) {
  const match = url.match(/^https?:\/\/(www\.)?([^#]+)(?:[\/:?#]|$)/i)
  return match && match[2]
}

Service.prototype.onBrowserActionClick = function (tab) {
  // для заблокированных отключено переключение без удаления из черного списка
  if (this.isBlocked(tab.url)) {
    return
  }

  this.mute(tab, !this.isMuted(tab))

  this.refreshIcon(tab)
  this.refreshContextMenu(tab)
}

Service.prototype.onTabChange = function (tab) {
  if (!tab || !tab.url) {
    return
  }

  // выключаем заблокированные
  if (this.isBlocked(tab.url) && !this.isMuted(tab)) {
    this.mute(tab, true)
  }

  this.refreshIcon(tab)
  this.refreshContextMenu(tab)
}

Service.prototype.onContextMenuClick = function (info) {
  const tabId = info.menuItemId

  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs.length) {
      return
    }

    const tab = tabs[0]
    if (!tab || !tab.url) {
      return
    }

    const url = tab.url

    let action
    switch (tabId) {
      case 'block-host':
        action = this.isHostBlocked(url) ? 'remove' : 'add'
        this.block(tab, 'host', action)
        break
      case 'block-page':
        action = this.isPageBlocked(url) ? 'remove' : 'add'
        this.block(tab, 'page', action)
        break
    }

    this.refreshIcon(tab)
    this.refreshContextMenu(tab)
  })
}

const service = new Service()

chrome.browserAction.onClicked.addListener((tab) => {
  service.onBrowserActionClick(tab)
})

chrome.tabs.onUpdated.addListener((tabId) => {
  chrome.tabs.get(tabId, (tab) => {
    service.onTabChange(tab)
  })
})

chrome.contextMenus.create({
  id: 'block-page',
  title: 'Add page to black list',
  contexts: ['browser_action'],
  onclick: (info) => {
    service.onContextMenuClick(info)
  }
})

chrome.contextMenus.create({
  id: 'block-host',
  title: 'Add domain to black list',
  contexts: ['browser_action'],
  onclick: (info) => {
    service.onContextMenuClick(info)
  }
})
