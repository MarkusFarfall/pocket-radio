import { proxyRadioBrowser } from "../../src/server/radioBrowserProxy";
import type { RadioBrowserRequest, RadioBrowserResponse } from "../../src/server/radioBrowserProxy";

export default function handler(req: RadioBrowserRequest, res: RadioBrowserResponse) {
  return proxyRadioBrowser(req, res, "click");
}
