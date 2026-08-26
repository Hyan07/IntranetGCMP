/** Entrada do Web App e gateway único de APIs. */

function doGet(event) {
  resetDataAccessRuntimeCache_();
  if (event && event.parameter && event.parameter.downloadUsers) return servePreparedUsersExport_(event.parameter.downloadUsers);
  if (event && event.parameter && event.parameter.downloadPersonnel) return servePreparedPersonnelExport_(event.parameter.downloadPersonnel);
  const template = HtmlService.createTemplateFromFile('50_UI_Index');
  template.appName = getRuntimeConfig_('NOME_SISTEMA', APP_CONFIG.NAME);
  template.appVersion = APP_CONFIG.VERSION;
  const output = template.evaluate()
    .setTitle(getRuntimeConfig_('NOME_SISTEMA', APP_CONFIG.NAME))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  const favicon = getRuntimeConfig_('FAVICON_URL', '');
  if (favicon) output.setFaviconUrl(favicon);
  return output;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function apiPublic(action, payload) {
  resetDataAccessRuntimeCache_();
  try {
    if (getProperty_(APP_CONFIG.PROPERTY_KEYS.INSTALLED, false) !== 'true' && action !== 'health') {
      throw appError_('APP_NOT_INSTALLED', 'Execute a função instalarSistema() antes de acessar a intranet.');
    }
    const routes = getPublicRoutes_(payload || {});
    if (!routes[action]) throw appError_('UNKNOWN_ACTION', 'Operação pública desconhecida.');
    return apiSuccess_(routes[action]());
  } catch (error) {
    return apiFailure_(error);
  }
}

function apiCall(token, action, payload) {
  resetDataAccessRuntimeCache_();
  let context = null;
  try {
    context = requireSession_(token);
    const passwordOnly = ['bootstrap', 'profile.changePassword', 'logout'];
    if (normalizeBoolean_(context.user.TROCAR_SENHA) && passwordOnly.indexOf(action) < 0) {
      throw appError_('PASSWORD_CHANGE_REQUIRED', 'Altere sua senha provisória para continuar.');
    }
    const routes = getAuthenticatedRoutes_(context, payload || {});
    if (!routes[action]) throw appError_('UNKNOWN_ACTION', 'Operação desconhecida ou indisponível.');
    return apiSuccess_(routes[action]());
  } catch (error) {
    if (context && error && error.code !== 'FORBIDDEN') {
      audit_(context, String(action || '').split('.')[0], 'ERRO_API', '', null, null, 'ERRO', '', error.code || error.message);
    }
    return apiFailure_(error);
  }
}

function getPublicHealth_() {
  return {
    name: APP_CONFIG.NAME,
    version: APP_CONFIG.VERSION,
    installed: getProperty_(APP_CONFIG.PROPERTY_KEYS.INSTALLED, false) === 'true'
  };
}

function getBootstrap_(context) {
  const branding = institutionBranding_();
  return {
    app: {
      name: getRuntimeConfig_('NOME_SISTEMA', APP_CONFIG.NAME),
      institution: getRuntimeConfig_('NOME_INSTITUICAO', 'Guarda Civil Municipal de Passos'),
      logoUrl: branding.logoUrl,
      logoDataUrl: branding.logoDataUrl,
      version: APP_CONFIG.VERSION,
      sessionExpiresAt: context.session.EXPIRA_EM
    },
    user: omitSensitiveUser_(context.user),
    permissions: context.permissions,
    modules: getVisibleModules_(context.permissions),
    mustChangePassword: normalizeBoolean_(context.user.TROCAR_SENHA)
  };
}
