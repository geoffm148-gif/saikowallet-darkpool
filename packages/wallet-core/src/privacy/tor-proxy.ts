/**
 * Tor / SOCKS5 proxy configuration types and wrappers.
 *
 * WHY Tor for RPC calls: RPC providers see the IP address of every request.
 * A surveillance adversary (ISP, compromised provider, state actor) can
 * correlate RPC calls to identify wallet owners by linking IP addresses
 * to on-chain addresses. Routing through Tor breaks this correlation.
 *
 * Architecture note: wallet-core is platform-agnostic TypeScript. The
 * actual SOCKS5 socket connection requires platform-specific I/O (Node.js
 * `net` module or Rust/Tauri native plugin). This module defines the
 * interface contracts. Platform layer (desktop/Tauri or RN native module)
 * provides the concrete implementation.
 *
 * Interface stability: these types are part of the public API. Any change
 * requires a major version bump.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** SOCKS protocol version. We only support SOCKS5 (required for Tor). */
export type SocksVersion = 5;

/** Authentication method for SOCKS5 proxy. */
export type SocksAuthMethod = 'none' | 'username-password';

export interface TorProxyConfig {
  readonly socksVersion: SocksVersion;
  readonly host: string;
  readonly port: number;
  readonly authMethod: SocksAuthMethod;
  readonly username?: string;
  readonly password?: string;
  /** Maximum time (ms) to wait for SOCKS5 handshake to complete. */
  readonly connectTimeoutMs: number;
  /** If true, DNS resolution happens on the proxy side (required for .onion). */
  readonly remoteDns: boolean;
}

/** A fetch-compatible function signature. */
export type FetchFn = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Platform-provided SOCKS5 connection factory.
 * The platform layer (Tauri plugin, Node.js native, etc.) implements this.
 * wallet-core receives it as a dependency injection parameter.
 */
export interface Socks5ConnectionFactory {
  /**
   * Open a TCP connection to `targetHost:targetPort` via the SOCKS5 proxy.
   * Returns a ReadableStream/WritableStream pair for bidirectional I/O.
   */
  connect(
    proxy: TorProxyConfig,
    targetHost: string,
    targetPort: number,
  ): Promise<Socks5Connection>;
}

export interface Socks5Connection {
  /** Write bytes to the remote end. */
  write(data: Uint8Array): Promise<void>;
  /** Read bytes from the remote end. Returns null on connection close. */
  read(): Promise<Uint8Array | null>;
  /** Close the connection. */
  close(): Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default Tor SOCKS5 proxy address (local Tor daemon). */
export const TOR_DEFAULT_HOST = '127.0.0.1';

/** Default Tor SOCKS5 port. */
export const TOR_DEFAULT_PORT = 9050;

/** Tor Browser uses a different default port (9150). */
export const TOR_BROWSER_PORT = 9150;

/** Connection timeout for Tor (longer than clearnet — onion routing adds latency). */
export const TOR_CONNECT_TIMEOUT_MS = 30_000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a TorProxyConfig for the standard local Tor daemon.
 *
 * @param socksHost - Tor SOCKS5 listener host (default: 127.0.0.1)
 * @param socksPort - Tor SOCKS5 listener port (default: 9050)
 *
 * WHY remoteDns=true: Without remote DNS, the client resolves the hostname
 * locally before connecting via SOCKS5, leaking the hostname to the local
 * network. With remoteDns=true (SOCKS5 CONNECT with DOMAINNAME type),
 * the proxy resolves the hostname, preventing DNS leaks.
 */
export function createTorProxyConfig(
  socksHost: string = TOR_DEFAULT_HOST,
  socksPort: number = TOR_DEFAULT_PORT,
): TorProxyConfig {
  if (!socksHost || socksHost.trim().length === 0) {
    throw new Error('socksHost must not be empty');
  }
  if (!Number.isInteger(socksPort) || socksPort < 1 || socksPort > 65535) {
    throw new Error(`socksPort must be 1–65535, got ${socksPort}`);
  }

  return {
    socksVersion: 5,
    host: socksHost.trim(),
    port: socksPort,
    authMethod: 'none', // Standard Tor doesn't require SOCKS auth
    connectTimeoutMs: TOR_CONNECT_TIMEOUT_MS,
    remoteDns: true, // Essential for .onion and DNS leak prevention
  };
}

/**
 * Create a TorProxyConfig with SOCKS5 username/password authentication.
 * Tor supports this for stream isolation (different circuits per username).
 *
 * WHY stream isolation: Using distinct SOCKS5 credentials per wallet
 * address causes Tor to use separate circuits for each address, preventing
 * a malicious exit node from correlating multiple addresses to one user.
 */
export function createTorProxyConfigWithAuth(
  socksHost: string,
  socksPort: number,
  username: string,
  password: string,
): TorProxyConfig {
  if (username.length === 0 || password.length === 0) {
    throw new Error('username and password must not be empty for authenticated proxy');
  }

  return {
    ...createTorProxyConfig(socksHost, socksPort),
    authMethod: 'username-password',
    username,
    password,
  };
}

/**
 * Wrap a fetch function to route all requests through a SOCKS5 proxy.
 *
 * WHY this wrapper exists: The platform layer provides the underlying
 * SOCKS5 connection mechanism. This wrapper adapts it to the standard
 * fetch interface expected by the RPC client and any HTTP code in wallet-core.
 *
 * NOTE: This returns a typed wrapper interface. The actual implementation
 * must be provided by the platform via `connectionFactory`. In environments
 * where a native SOCKS5 library is available (Node.js with 'socks' package,
 * Rust/Tauri with reqwest+socks), the platform provides that factory.
 *
 * @param proxyConfig - SOCKS5 proxy configuration (from createTorProxyConfig)
 * @param connectionFactory - Platform-specific SOCKS5 connection implementation
 * @returns A fetch-compatible function that routes through the proxy
 */
export function wrapFetchWithProxy(
  proxyConfig: TorProxyConfig,
  connectionFactory: Socks5ConnectionFactory,
): FetchFn {
  return async function proxiedFetch(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // Parse the target URL to extract host and port for SOCKS5 CONNECT
    const url = typeof input === 'string' ? new URL(input) : input;
    const targetHost = url.hostname;
    const targetPort = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);

    // Establish SOCKS5 tunnel to the target
    const connection = await connectionFactory.connect(proxyConfig, targetHost, targetPort);

    // The platform is responsible for the HTTP-over-SOCKS5 plumbing.
    // Here we build the raw HTTP/1.1 request and pass it through the tunnel.
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = init?.body;

    // Ensure Host header is set (required by HTTP/1.1)
    if (!headers.has('Host')) {
      headers.set('Host', url.host);
    }

    // Build raw HTTP/1.1 request
    let requestLines = `${method} ${url.pathname}${url.search} HTTP/1.1\r\n`;
    headers.forEach((value, key) => {
      requestLines += `${key}: ${value}\r\n`;
    });
    requestLines += '\r\n';

    const requestBytes = new TextEncoder().encode(requestLines);

    try {
      await connection.write(requestBytes);

      if (body !== null && body !== undefined) {
        const bodyBytes =
          typeof body === 'string'
            ? new TextEncoder().encode(body)
            : body instanceof Uint8Array
            ? body
            : new Uint8Array(await new Response(body).arrayBuffer());
        await connection.write(bodyBytes);
      }

      // Read the response
      const chunks: Uint8Array[] = [];
      let chunk: Uint8Array | null;
      while ((chunk = await connection.read()) !== null) {
        chunks.push(chunk);
      }

      // Combine all chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const responseBytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const c of chunks) {
        responseBytes.set(c, offset);
        offset += c.length;
      }

      // Parse the HTTP response (basic parsing — production should use a proper parser)
      return parseHttpResponse(responseBytes);
    } finally {
      await connection.close();
    }
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Minimal HTTP/1.1 response parser.
 * WHY minimal: A full HTTP parser is beyond the scope of this module.
 * In production, the platform layer (Node.js http module, Rust reqwest)
 * handles proper HTTP parsing. This is a reference implementation.
 */
function parseHttpResponse(bytes: Uint8Array): Response {
  const text = new TextDecoder().decode(bytes);
  const headerEnd = text.indexOf('\r\n\r\n');

  if (headerEnd === -1) {
    throw new Error('Malformed HTTP response: no header terminator');
  }

  const headerSection = text.slice(0, headerEnd);
  const bodyText = text.slice(headerEnd + 4);

  const lines = headerSection.split('\r\n');
  const statusLine = lines[0] ?? '';
  const statusMatch = statusLine.match(/^HTTP\/1\.[01] (\d{3})/);
  const status = statusMatch ? parseInt(statusMatch[1]!, 10) : 200;

  const responseHeaders = new Headers();
  for (const line of lines.slice(1)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      responseHeaders.set(line.slice(0, colonIdx).trim(), line.slice(colonIdx + 1).trim());
    }
  }

  return new Response(bodyText, { status, headers: responseHeaders });
}
