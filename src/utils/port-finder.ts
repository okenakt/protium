import * as net from "net";

/**
 * Port allocation utilities for kernel connections
 */

/**
 * Check if a port is available on localhost
 * @param port Port number to check
 * @returns Promise that resolves to true if port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close();
      resolve(true);
    });

    server.listen(port, "127.0.0.1");
  });
}

/**
 * Find an available port starting from the given base port
 * @param startPort Port to start searching from
 * @param maxAttempts Maximum number of ports to try (default: 100)
 * @returns Promise that resolves to an available port number
 * @throws Error if no available port is found
 */
export async function findAvailablePort(
  startPort: number,
  maxAttempts: number = 100,
): Promise<number> {
  let port = startPort;

  for (let i = 0; i < maxAttempts; i++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }

  throw new Error(
    `Could not find available port after ${maxAttempts} attempts starting from ${startPort}`,
  );
}

/**
 * Find a range of consecutive available ports
 * @param count Number of consecutive ports needed
 * @param minPort Minimum port number to start from (default: 49152, IANA ephemeral range)
 * @param maxPort Maximum port number (default: 65535)
 * @returns Promise that resolves to the first port number of the available range
 * @throws Error if unable to find the required consecutive ports
 */
export async function findConsecutiveAvailablePorts(
  count: number,
  minPort: number = 49152,
  maxPort: number = 65535,
): Promise<number> {
  // Random starting point to reduce collision probability
  const basePort =
    minPort + Math.floor(Math.random() * (maxPort - minPort - count));

  let availableBasePort = await findAvailablePort(basePort);

  // Verify all consecutive ports are available
  for (let i = 0; i < count; i++) {
    if (!(await isPortAvailable(availableBasePort + i))) {
      // If any port is not available, start over with next base
      availableBasePort = await findAvailablePort(availableBasePort + count);
      i = -1; // Reset loop to verify all ports again
    }
  }

  return availableBasePort;
}

/**
 * Get the IANA-recommended ephemeral port range
 * @returns Object with min and max port numbers
 */
export function getEphemeralPortRange(): { min: number; max: number } {
  return {
    min: 49152,
    max: 65535,
  };
}
