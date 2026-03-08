export type {
  WCSession,
  WCRequest,
  WCRequestResult,
  SupportedMethod,
} from './types.js';

export { SUPPORTED_METHODS } from './types.js';

export {
  signMessage,
  signTypedData,
  parseSendTransactionRequest,
} from './request-handler.js';

export type { ParsedTxRequest } from './request-handler.js';
