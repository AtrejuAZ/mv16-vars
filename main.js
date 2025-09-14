const net = require('net')
const { InstanceBase, InstanceStatus, Regex } = require('@companion-module/base')

class MV16Vars extends InstanceBase {
  socket = null

  async init(config) {
    this.updateStatus(InstanceStatus.Connecting)
    this.setActionDefinitions(this.getActions())
    await this.connect(config)
  }

  async configUpdated(config) {
    await this.connect(config)
  }

  getConfigFields() {
    return [
      { type: 'textinput', id: 'host', label: 'MV16 IP address', width: 6, default: '192.168.1.100', regex: Regex.IP },
      { type: 'number', id: 'port', label: 'Port', width: 3, default: 9990, min: 1, max: 65535 },
    ]
  }

  async connect(config) {
    try {
      if (this.socket) {
        this.socket.removeAllListeners()
        this.socket.destroy()
        this.socket = null
      }

      const host = config?.host
      const port = Number(config?.port) || 9990
      if (!host || !port) {
        this.updateStatus(InstanceStatus.BadConfig, 'Missing host/port')
        return
      }

      const sock = new net.Socket()
      this.socket = sock

      sock.once('connect', () => this.updateStatus(InstanceStatus.Ok))
      sock.on('error', (err) => {
        this.log('error', `TCP error: ${err?.message || err}`)
        this.updateStatus(InstanceStatus.ConnectionFailure, err?.message || 'socket error')
      })
      sock.on('close', () => this.updateStatus(InstanceStatus.Disconnected))

      sock.connect(port, host)
    } catch (e) {
      this.log('error', `connect failed: ${e?.message || e}`)
      this.updateStatus(InstanceStatus.ConnectionFailure, e?.message || 'connect failed')
    }
  }

  getActions() {
    return {
      rename_source_vars: {
        name: 'Rename source (with variables)',
        options: [
          {
            type: 'dropdown',
            id: 'source',
            label: 'Source',
            default: 1,
            choices: Array.from({ length: 16 }, (_, i) => ({ id: i + 1, label: String(i + 1) })),
          },
          { type: 'textinput', id: 'label', label: 'New label', default: '', useVariables: true },
        ],
        // seit Companion 3.x: context.parseVariablesInString() löst auch Local Variables
        callback: async (event, context) => {
          const idx = Number(event.options.source) - 1 // Protokoll ist 0-basiert
          const raw = event.options.label ?? ''
          const resolved = await context.parseVariablesInString(String(raw))
          const payload = `INPUT LABELS:\n${idx} ${resolved}\n\n`
          await this.send(payload)
        },
      },
    }
  }

  async send(text) {
    if (!this.socket || !this.socket.writable) {
      this.updateStatus(InstanceStatus.ConnectionFailure, 'Not connected')
      throw new Error('socket not connected')
    }
    this.socket.write(text, 'utf8')
  }

  async destroy() {
    try {
      if (this.socket) {
        this.socket.removeAllListeners()
        this.socket.destroy()
      }
    } catch {}
    this.socket = null
  }
}

module.exports = MV16Vars
