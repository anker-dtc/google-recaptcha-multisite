import { Injectable, Inject } from '@nestjs/common';
import { GoogleRecaptchaEnterpriseValidator } from './validators/google-recaptcha-enterprise.validator';
import { GoogleRecaptchaValidator } from './validators/google-recaptcha.validator';
import { AbstractGoogleRecaptchaValidator } from './validators/abstract-google-recaptcha-validator';
import { RecaptchaConfigRef } from '../models/recaptcha-config-ref';
import { GoogleRecaptchaException } from '../exceptions/google-recaptcha.exception';
import { ErrorCode } from '../enums/error-code';
import { RECAPTCHA_AXIOS_INSTANCE, RECAPTCHA_LOGGER } from '../provider.declarations';
import { AxiosInstance } from 'axios';
import { Logger } from '@nestjs/common';
import { EnterpriseReasonTransformer } from './enterprise-reason.transformer';
import { GOOGLE_RECAPTCHA_SECRET_MAP } from '../index';

@Injectable()
export class RecaptchaValidatorResolver {
	constructor(
		private readonly configRef: RecaptchaConfigRef,
		@Inject(RECAPTCHA_AXIOS_INSTANCE) private readonly axios: AxiosInstance,
		@Inject(RECAPTCHA_LOGGER) private readonly logger: Logger,
		private readonly enterpriseReasonTransformer: EnterpriseReasonTransformer
	) {}

	resolve(siteKey?: string): AbstractGoogleRecaptchaValidator<unknown> {
		if (this.configRef.valueOf.enterprise) {
			return new GoogleRecaptchaEnterpriseValidator(
				this.axios,
				this.logger,
				this.configRef,
				this.enterpriseReasonTransformer
			);
		}

		const validator = new GoogleRecaptchaValidator(
			this.axios,
			this.logger,
			this.configRef
		);

		// 如果提供了 siteKey，按以下优先级查找 secretKey:
		// 1. 多站点配置 (sites array)
		// 2. 全局 SECRET_MAP (GOOGLE_RECAPTCHA_SECRET_MAP)
		if (siteKey) {
			this.logger.debug(`[reCAPTCHA] Resolving secret for site key: ${siteKey.substring(0, 20)}...`);

			// 1. 先从 sites 配置中查找
			if (this.configRef.valueOf.sites) {
				const siteConfig = this.configRef.valueOf.sites.find(site => site.siteKey === siteKey);
				if (siteConfig) {
					this.logger.debug(`[reCAPTCHA] Found in sites config: ${siteConfig.name}`);
					validator.setCurrentSecretKey(siteConfig.secretKey);
					return validator;
				}
				this.logger.debug(`[reCAPTCHA] Not found in sites config, trying SECRET_MAP...`);
			}

			// 2. 从全局 SECRET_MAP 中查找 (fallback)
			if (GOOGLE_RECAPTCHA_SECRET_MAP[siteKey]) {
				this.logger.debug(`[reCAPTCHA] Found in SECRET_MAP`);
				validator.setCurrentSecretKey(GOOGLE_RECAPTCHA_SECRET_MAP[siteKey]);
				return validator;
			}

			// 如果都找不到，抛出异常
			this.logger.error(`[reCAPTCHA] No secret found for site key: ${siteKey.substring(0, 20)}...`);
			this.logger.error(`[reCAPTCHA] Available keys in SECRET_MAP: ${Object.keys(GOOGLE_RECAPTCHA_SECRET_MAP).map(k => k.substring(0, 20) + '...').join(', ')}`);
			throw new GoogleRecaptchaException(
				[ErrorCode.MissingInputSecret],
				`No secret key found for site key: ${siteKey}`
			);
		}

		// 如果没有提供 siteKey 但有多站点配置，使用第一组配置
		if (this.configRef.valueOf.sites?.length > 0) {
			validator.setCurrentSecretKey(this.configRef.valueOf.sites[0].secretKey);
			return validator;
		}

		// 如果没有多站点配置，使用默认的 secretKey
		return validator;
	}
}
