import { WebSocketInterfaceError } from './wsError';

export class Utils {
  static checkURL(url: URL) {
    // Assert is cloud url
    if (!url.searchParams.has('token')) {
      if (!(url.username || url.password)) {
        throw new WebSocketInterfaceError(
          'invalid url, password or username needed.'
        );
      }
    }
  }
}
