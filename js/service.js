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

    chrome.tabs.onActivated.addListener(activeInfo => {
      chrome.tabs.get(activeInfo.tabId, async (tab) => {
        this.onTabChanged(tab)
      })
    })

    chrome.tabs.onUpdated.addListener(tabId => {
      chrome.tabs.get(tabId, async (tab) => {
        this.onTabChanged(tab)
      })
    })

    chrome.contextMenus.onClicked.addListener(function (info, tab) {
      service.onContextMenuClick(info)
    })
  }

  async onTabChanged (tab) {
    if (!tab || !tab.url) {
      return
    }

    if (this.isBlocked(tab.url)) {
      await this.mute(tab, true)
    }

    this.refreshIcon(tab)
    this.refreshContextMenu(tab)
  }

  async onActionClick (tab) {
    // для заблокированных отключено переключение без удаления из черного списка
    if (this.isBlocked(tab.url)) {
      return
    }

    if (this.isTabMuted(tab)) {
      await this.unmute(tab)
    } else {
      await this.mute(tab)
    }

    this.refreshIcon(tab)
    this.refreshContextMenu(tab)
  }

  onContextMenuClick (info) {
    const menuId = info.menuItemId

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs.length) {
        return
      }

      const tab = tabs[0]
      if (!tab || !tab.url) {
        return
      }

      const url = tab.url
      let action

      switch (menuId) {
        case MENU_BLOCKED_HOSTS:
          action = this.isHostBlocked(url) ? ACTION_UNBLOCK : ACTION_BLOCK
          await this.block(tab, 'host', action)
          break
        case MENU_BLOCKED_PAGES:
          action = this.isPageBlocked(url) ? ACTION_UNBLOCK : ACTION_BLOCK
          await this.block(tab, 'page', action)
          break
      }

      this.refreshIcon(tab)
      this.refreshContextMenu(tab)
    })
  }

  async mute (tab) {
    if (this.isTabMuted(tab)) {
      return
    }

    const tabId = tab.id
    await chrome.tabs.update(tabId, { muted: true })
  }

  async unmute (tab) {
    if (!this.isTabMuted(tab)) {
      return
    }

    const tabId = tab.id
    await chrome.tabs.update(tabId, { muted: false })
  }

  async block (tab, what, action) {
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
        if (!this[field].includes(uid)) {
          this[field].push(uid)
        }
        await this.mute(tab)
        break
      case ACTION_UNBLOCK:
        this[field] = this[field].filter(v => v !== uid)
        await this.unmute(tab)
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
      path: this.resolveTabIcon(tab),
      tabId: tab.id
    })
  }

  isTabMuted (tab) {
    return tab.mutedInfo.muted
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

  resolveTabIcon (tab) {
    switch (true) {
      case this.isBlocked(tab.url):
        return '../images/icon-blocked.png'
      case this.isTabMuted(tab):
        return '../images/icon-muted.png'
      default:
        return '../images/icon-normal.png'
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
    const data = {}
    this.storedFields.forEach((key) => {
      data[key] = this[key]
    })
    this.storage.set(data)
  }
}

const service = new Service()
service.run()
