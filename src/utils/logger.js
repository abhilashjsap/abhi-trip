const isDev = import.meta.env.DEV;

const timestamp = () => new Date().toISOString();

export const logger = {
  info: (...args) => {
    if (isDev) console.log(`[INFO ${timestamp()}]`, ...args);
  },
  warn: (...args) => {
    console.warn(`[WARN ${timestamp()}]`, ...args);
  },
  error: (...args) => {
    console.error(`[ERROR ${timestamp()}]`, ...args);
  },
  debug: (...args) => {
    if (isDev) console.debug(`[DEBUG ${timestamp()}]`, ...args);
  },
};

export default logger;
