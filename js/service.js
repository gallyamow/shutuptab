'use strict'

/**
 * @typedef {Object} chrome
 * @property {*} tabs
 * @property {*} action
 * @property {*} contextMenus
 */

const MENU_BLOCKED_PAGES = 'blocked-pages'
const MENU_BLOCKED_HOSTS = 'blocked-hosts'

const ACTION_BLOCK = 'block'
const ACTION_UNBLOCK = 'unblock'

class Service {
  constructor () {
    /**
     * Состояние вкладок.
     * Вынужден хранить tab.mutedInfo появится (c chrome 46)
     * @type {Array}
     */
    this.mutedTabs = []

    this.blockedHosts = []
    this.blockedPages = []

    this.storage = chrome.storage.sync
    this.storedFields = ['blockedHosts', 'blockedPages']
  }

  run () {
    this.readStorage()
    this.buildMenu()
    this.listenEvents()
  }

  /**
   * @private
   */
  listenEvents () {
    chrome.action.onClicked.addListener(tab => {
      this.onActionClick(tab)
    })

    chrome.tabs.onUpdated.addListener(tabId => {
      chrome.tabs.get(tabId, (tab) => {
        this.onTabChanged(tab)
      })
    })

    chrome.contextMenus.onClicked.addListener(function (info, tab) {
      service.onContextMenuClick(info)
    })
  }

  onTabChanged (tab) {
    if (!tab || !tab.url) {
      return
    }

    if (this.isBlocked(tab.url) && !this.isMuted(tab)) {
      this.mute(tab, true)
    }

    this.refreshIcon(tab)
    this.refreshContextMenu(tab)
  }

  onActionClick (tab) {
    // для заблокированных отключено переключение без удаления из черного списка
    if (this.isBlocked(tab.url)) {
      return
    }

    if (this.isMuted(tab)) {
      this.unmute(tab.id)
    } else {
      this.mute(tab.id)
    }

    this.refreshIcon(tab)
    this.refreshContextMenu(tab)
  }

  onContextMenuClick (info) {
    const tabId = info.menuItemId

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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
        case MENU_BLOCKED_HOSTS:
          action = this.isHostBlocked(url) ? ACTION_UNBLOCK : ACTION_BLOCK
          this.block(tab, 'host', action)
          break
        case MENU_BLOCKED_PAGES:
          action = this.isPageBlocked(url) ? ACTION_UNBLOCK : ACTION_BLOCK
          this.block(tab, 'page', action)
          break
      }

      this.refreshIcon(tab)
      this.refreshContextMenu(tab)
    })
  }

  mute (tabId) {
    if (this.mutedTabs.includes(tabId)) {
      return
    }

    this.mutedTabs.push(tabId)
    chrome.tabs.update(tabId, { muted: true })
  }

  unmute (tabId) {
    if (!this.mutedTabs.includes(tabId)) {
      return
    }

    this.mutedTabs = this.mutedTabs.filter(v => v !== tabId)
    chrome.tabs.update(tab.id, { muted: false })
  }

  block (tab, what, action) {
    const url = tab.url

    let uid, field
    switch (what) {
      case 'host':
        uid = this.resolveHostUid(url)
        field = 'blockedHosts'
        break
      case 'page':
        uid = this.resolvePageUid(url)
        field = 'blockedPages'
        break
      default:
        throw new Error('Unknown value for what ' + what)
    }

    switch (action) {
      case ACTION_BLOCK:
        this[field].push(uid)
        this.mute(tab.id)
        break
      case ACTION_UNBLOCK:
        this[field] = this[field].filter(v => v !== uid)
        this.unmute(tab.id)
        break
    }

    this.writeStorage()
  }

  buildMenu () {
    chrome.contextMenus.create({
      id: MENU_BLOCKED_PAGES,
      title: 'Add page to black list',
      contexts: ['action']
    })

    chrome.contextMenus.create({
      id: MENU_BLOCKED_HOSTS,
      title: 'Add domain to black list',
      contexts: ['action'],
    })
  }

  refreshContextMenu (tab) {
    chrome.contextMenus.update(MENU_BLOCKED_HOSTS, {
      title: this.isHostBlocked(tab.url)
        ? 'Remove domain from blacklist'
        : 'Add domain to blacklist'
    })

    chrome.contextMenus.update(MENU_BLOCKED_PAGES, {
      title: this.isPageBlocked(tab.url)
        ? 'Remove page from blacklist'
        : 'Add page to blacklist'
    })
  }

  refreshIcon (tab) {
    chrome.action.setIcon({
      path: this.resolveTabIcon(tab.url, tab.id),
      tabId: tab.id
    })
  }

  isMuted (tabId) {
    return this.mutedTabs.includes(tabId)
  }

  isHostBlocked (url) {
    return this.blockedHosts.indexOf(this.resolveHostUid(url)) !== -1
  }

  isPageBlocked (url) {
    return this.blockedPages.indexOf(this.resolvePageUid(url)) !== -1
  }

  isBlocked (url) {
    return this.isHostBlocked(url) || this.isPageBlocked(url)
  }

  resolveTabIcon (tabUrl, tabId) {
    switch (true) {
      case this.isBlocked(tabUrl):
        return 'images/icon-blocked.png'
      case this.isMuted(tabId):
        return 'images/icon-muted.png'
      default:
        return 'images/icon-normal.png'
    }
  }

  resolveHostUid (url) {
    const match = url.match(/^https?:\/\/(www\.)?([^\/:?#]+)(?:[\/:?#]|$)/i)
    return match && match[2]
  }

  resolvePageUid (url) {
    const match = url.match(/^https?:\/\/(www\.)?([^#]+)(?:[\/:?#]|$)/i)
    return match && match[2]
  }

  readStorage () {
    this.storage.get(this.storedFields, (items) => {
      this.storedFields.forEach((key) => {
        if (items[key]) {
          this[key] = items[key]
        }
      })
    })
  }

  writeStorage () {
    const data = this.storedFields.reduce((prev, key) => prev[key] = this[key], {})
    this.storage.set(data)
  }
}

const service = new Service()
service.run()
