/** Check the configured APP_ORIGIN: Wrangler rewrites request URLs to the production route even in local dev. */
export const localMockEnabled=(devMode:string|undefined,hostname:string)=>devMode==='true'&&['localhost','127.0.0.1','[::1]','::1'].includes(hostname);
