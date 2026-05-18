import { WebpayPlus, Options, IntegrationApiKeys, Environment, IntegrationCommerceCodes } from 'transbank-sdk';

const tx = new WebpayPlus.Transaction(
  new Options(
    IntegrationCommerceCodes.WEBPAY_PLUS, // Código de comercio de prueba
    IntegrationApiKeys.WEBPAY,            // Api Key de prueba
    Environment.Integration               // Ambiente
  )
);

export default tx;