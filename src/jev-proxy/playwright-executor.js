// src/jev-proxy/playwright-executor.js
'use strict';

/**
 * Playwright Executor — jedyny komponent który zna ref.
 *
 * Wykonuje 4 operacje MVP:
 * - click(ref)
 * - fill(ref, value)
 * - read() — pobiera snapshot
 * - navigate(url)
 *
 * Zwraca ActionFeedback { status, pageChanged, error? }.
 */
class PlaywrightExecutor {
  /**
   * @param {(method: string, params: object) => Promise<any>} rpcCall
   *   Funkcja wywołująca JSON-RPC tools/call na child Playwright MCP.
   */
  constructor(rpcCall) {
    this.rpcCall = rpcCall;
    this._lastSnapshotHash = null;
  }

  /**
   * @param {string} ref
   * @returns {Promise<{ status: 'success' | 'error', pageChanged: boolean, error?: string }>}
   */
  async executeClick(ref) {
    try {
      await this.rpcCall('tools/call', {
        name: 'browser_click',
        arguments: { ref },
      });
      return { status: 'success', pageChanged: true };
    } catch (error) {
      return { status: 'error', pageChanged: false, error: error.message };
    }
  }

  /**
   * @param {string} ref
   * @param {string} value
   * @returns {Promise<{ status: 'success' | 'error', pageChanged: boolean, error?: string }>}
   */
  async executeFill(ref, value) {
    try {
      await this.rpcCall('tools/call', {
        name: 'browser_fill_form',
        arguments: { ref, value },
      });
      return { status: 'success', pageChanged: false };
    } catch (error) {
      return { status: 'error', pageChanged: false, error: error.message };
    }
  }

  /**
   * @param {string} url
   * @returns {Promise<{ status: 'success' | 'error', pageChanged: boolean, error?: string }>}
   */
  async executeNavigate(url) {
    try {
      await this.rpcCall('tools/call', {
        name: 'browser_navigate',
        arguments: { url },
      });
      return { status: 'success', pageChanged: true };
    } catch (error) {
      return { status: 'error', pageChanged: false, error: error.message };
    }
  }

  /**
   * Pobierz snapshot (tekst accessibility tree).
   * @returns {Promise<string>}
   */
  async executeRead() {
    try {
      const result = await this.rpcCall('tools/call', {
        name: 'browser_snapshot',
        arguments: {},
      });
      const text = result?.content?.[0]?.text || '';
      return text;
    } catch (error) {
      return `[Error reading page: ${error.message}]`;
    }
  }

  /**
   * Pobierz surowy snapshot i zwróć go.
   * @returns {Promise<string>}
   */
  async getSnapshot() {
    return this.executeRead();
  }
}

module.exports = { PlaywrightExecutor };
