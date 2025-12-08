import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { RECAPTCHA_LOGGER, RECAPTCHA_VALIDATION_OPTIONS } from '../provider.declarations';
import { GoogleRecaptchaException } from '../exceptions/google-recaptcha.exception';
import { Reflector } from '@nestjs/core';
import { RecaptchaRequestResolver } from '../services/recaptcha-request.resolver';
import { VerifyResponseDecoratorOptions } from '../interfaces/verify-response-decorator-options';
import { RecaptchaValidatorResolver } from '../services/recaptcha-validator.resolver';
import { GoogleRecaptchaContext } from '../enums/google-recaptcha-context';
import { AbstractGoogleRecaptchaValidator } from '../services/validators/abstract-google-recaptcha-validator';
import { GoogleRecaptchaEnterpriseValidator } from '../services/validators/google-recaptcha-enterprise.validator';
import { LiteralObject } from '../interfaces/literal-object';
import { RecaptchaConfigRef } from '../models/recaptcha-config-ref';

@Injectable()
export class GoogleRecaptchaGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly requestResolver: RecaptchaRequestResolver,
		private readonly validatorResolver: RecaptchaValidatorResolver,
		@Inject(RECAPTCHA_LOGGER) private readonly logger: Logger,
		private readonly configRef: RecaptchaConfigRef,
	) {}

	private resolveLogContext(validator: AbstractGoogleRecaptchaValidator<unknown>): string {
		return validator instanceof GoogleRecaptchaEnterpriseValidator
			? GoogleRecaptchaContext.GoogleRecaptchaEnterprise
			: GoogleRecaptchaContext.GoogleRecaptcha;
	}

	async canActivate(context: ExecutionContext): Promise<true | never> {
		const request: LiteralObject = this.requestResolver.resolve(context);

		console.log(`[reCAPTCHA Guard] ========== New reCAPTCHA Request ==========`);
		console.log(`[reCAPTCHA Guard] Request URL: ${request.url || 'N/A'}`);
		console.log(`[reCAPTCHA Guard] Request Method: ${request.method || 'N/A'}`);

		const skipIfValue = this.configRef.valueOf.skipIf;
		const skip = typeof skipIfValue === 'function' ? await skipIfValue(request) : !!skipIfValue;

		if (skip) {
			console.log(`[reCAPTCHA Guard] Validation skipped (skipIf=true)`);
			return true;
		}

		const options: VerifyResponseDecoratorOptions = this.reflector.get(RECAPTCHA_VALIDATION_OPTIONS, context.getHandler()) || {};

		// 从请求头或装饰器选项中获取siteKey
		let siteKey = request.headers['x-recaptcha-sitekey'];
		console.log(`[reCAPTCHA Guard] Site key from header: ${siteKey ? siteKey.substring(0, 20) + '...' : 'not provided'}`);

		if (options.site && this.configRef.valueOf.sites) {
			const siteConfig = this.configRef.valueOf.sites.find(site => site.name === options.site);
			if (siteConfig) {
				siteKey = siteConfig.siteKey;
				console.log(`[reCAPTCHA Guard] Site key from decorator site '${options.site}': ${siteKey.substring(0, 20)}...`);
			}
		}

		const [response, remoteIp] = await Promise.all([
			options?.response ? await options.response(request) : await this.configRef.valueOf.response(request),
			options?.remoteIp ? await options.remoteIp(request) : await this.configRef.valueOf.remoteIp && this.configRef.valueOf.remoteIp(request),
		]);

		console.log(`[reCAPTCHA Guard] Token extracted (first 50 chars): ${response ? response.substring(0, 50) + '...' : 'NOT FOUND'}`);
		console.log(`[reCAPTCHA Guard] Remote IP: ${remoteIp || 'not provided'}`);

		const score = options?.score || this.configRef.valueOf.score;
		const action = options?.action;

		console.log(`[reCAPTCHA Guard] Resolving validator for site key: ${siteKey ? siteKey.substring(0, 20) + '...' : 'undefined'}`);
		const validator = this.validatorResolver.resolve(siteKey);

		console.log(`[reCAPTCHA Guard] Calling validator.validate()...`);
		request.recaptchaValidationResult = await validator.validate({ response, remoteIp, score, action });

		console.log(`[reCAPTCHA Guard] Validation result - Success: ${request.recaptchaValidationResult.success}`);
		console.log(`[reCAPTCHA Guard] Validation result - Errors: ${JSON.stringify(request.recaptchaValidationResult.errors)}`);
		console.log(`[reCAPTCHA Guard] Validation result - Score: ${request.recaptchaValidationResult.score}`);
		console.log(`[reCAPTCHA Guard] Validation result - Action: ${request.recaptchaValidationResult.action}`);

		if (this.configRef.valueOf.debug) {
			const loggerCtx = this.resolveLogContext(validator);
			this.logger.debug(request.recaptchaValidationResult.toObject(), `${loggerCtx}.result`);
		}

		if (request.recaptchaValidationResult.success) {
			console.log(`[reCAPTCHA Guard] ========== Validation PASSED ==========`);
			return true;
		}

		console.error(`[reCAPTCHA Guard] ========== Validation FAILED ==========`);
		throw new GoogleRecaptchaException(request.recaptchaValidationResult.errors);
	}
}
