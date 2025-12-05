# google-recaptcha-multisite

A NestJS module for Google reCAPTCHA (v2/v3) with **multi-site support** and **legacy NestJS 7.x compatibility**.

Forked from [@nestlab/google-recaptcha](https://github.com/chvarkov/google-recaptcha) with enhancements for:
- ✅ **Multi-site support**: Manage multiple reCAPTCHA configurations for different domains (e.g., eufy.com, anker.com, soundcore.com)
- ✅ **NestJS 7+ compatibility**: Works with NestJS 7.0.0 through 11.x
- ✅ **Runtime secret loading**: Load secrets from AWS Secrets Manager or other external sources at runtime
- ✅ **Backward compatible**: Drop-in replacement for @nestlab/google-recaptcha

## Installation

```bash
npm install github:anker-dtc/google-recaptcha-multisite
```

## Why This Fork?

The original [@nestlab/google-recaptcha](https://github.com/chvarkov/google-recaptcha) package only supports:
- Single site configuration
- NestJS 8.0.0+

This fork adds:
1. **Multi-site configuration**: Essential for platforms serving multiple brands/domains
2. **NestJS 7.x support**: Required for legacy projects that haven't upgraded to NestJS 8+
3. **Runtime secret management**: Export `GOOGLE_RECAPTCHA_SECRET_MAP` for loading secrets at runtime (e.g., from AWS Secrets Manager)

## Use Cases

- **Multi-brand platforms**: Anker, Eufy, Soundcore, AnkerMake, etc. each with their own reCAPTCHA keys
- **Legacy NestJS projects**: Projects using NestJS 7.x that need reCAPTCHA validation
- **Secret management**: Projects loading secrets from external sources (AWS Secrets Manager, Vault, etc.)

## Quick Start

### Single Site Configuration

```typescript
import { GoogleRecaptchaModule } from 'google-recaptcha-multisite';

@Module({
    imports: [
        GoogleRecaptchaModule.forRoot({
            secretKey: 'your-secret-key',
            response: (req) => req.body.recaptcha,
        }),
    ],
})
export class AppModule {}
```

### Multi-Site Configuration

**Option 1: Static Configuration**

```typescript
import { GoogleRecaptchaModule } from 'google-recaptcha-multisite';

@Module({
    imports: [
        GoogleRecaptchaModule.forRoot({
            sites: [
                { siteKey: 'eufy-site-key', secretKey: 'eufy-secret-key', name: 'eufy' },
                { siteKey: 'anker-site-key', secretKey: 'anker-secret-key', name: 'anker' },
            ],
            response: (req) => req.body.recaptcha,
        }),
    ],
})
export class AppModule {}
```

**Option 2: Async Configuration (Recommended)**

```typescript
import { GoogleRecaptchaModule } from 'google-recaptcha-multisite';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
    imports: [
        GoogleRecaptchaModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (config: ConfigService) => ({
                sites: config.get('googleRecaptcha.sites'),
                response: (req) => req.body.recaptcha,
            }),
            inject: [ConfigService],
        }),
    ],
})
export class AppModule {}
```

### Runtime Secret Loading (AWS Secrets Manager)

If you need to load secrets at runtime (e.g., from AWS Secrets Manager), use the exported `GOOGLE_RECAPTCHA_SECRET_MAP`:

```typescript
// In your bootstrap function (main.ts)
import { GOOGLE_RECAPTCHA_SECRET_MAP } from 'google-recaptcha-multisite';
import { getSecretsFromAWS } from './config/secrets';

async function bootstrap() {
  // Load secrets from AWS Secrets Manager
  const secrets = await getSecretsFromAWS();

  // Populate the global secret map
  GOOGLE_RECAPTCHA_SECRET_MAP['eufy-site-key'] = secrets.eufySecretKey;
  GOOGLE_RECAPTCHA_SECRET_MAP['anker-site-key'] = secrets.ankerSecretKey;

  // Create NestJS app
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
```

This approach allows you to:
- Keep secrets out of environment variables
- Rotate secrets without redeploying
- Use centralized secret management (AWS Secrets Manager, HashiCorp Vault, etc.)

## Environment Variables

You can also configure using environment variables:

```env
# Single site (backward compatible)
GOOGLE_RECAPTCHA_SECRET_KEY=your-secret-key

# Multi-site
GOOGLE_RECAPTCHA_SITES=[{"siteKey":"site-key-1","secretKey":"secret-key-1","name":"site-1"},{"siteKey":"site-key-2","secretKey":"secret-key-2","name":"site-2"}]

# Validation settings
GOOGLE_RECAPTCHA_ACTIONS=["SignUp","SignIn","Login"]
GOOGLE_RECAPTCHA_SCORE=0.5
```

## Usage Examples

### Using Decorator

```typescript
import { Recaptcha } from 'google-recaptcha-multisite';

@Controller('auth')
export class AuthController {
    @Recaptcha({
        action: 'login',
        score: 0.8,
    })
    @Post('login')
    login() {
        // Protected by reCAPTCHA
        return { success: true };
    }
}
```

### Using Guard

```typescript
import { UseGuards } from '@nestjs/common';
import { GoogleRecaptchaGuard } from 'google-recaptcha-multisite';

@Controller('auth')
@UseGuards(GoogleRecaptchaGuard)
export class AuthController {
    @Post('login')
    login() {
        // All routes protected
        return { success: true };
    }
}
```

### Error Handling

```typescript
import { GoogleRecaptchaFilter } from 'google-recaptcha-multisite';

// In main.ts
app.useGlobalFilters(new GoogleRecaptchaFilter());
```

## Frontend Integration

### 1. Load reCAPTCHA Script

```html
<script src="https://www.google.com/recaptcha/api.js?render=YOUR_SITE_KEY"></script>
```

### 2. Execute reCAPTCHA and Send Token

```javascript
// Get verification token
const token = await grecaptcha.execute('YOUR_SITE_KEY', { action: 'login' });

// Send request with token
fetch('/auth/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Recaptcha-Sitekey': 'YOUR_SITE_KEY',  // Required for multi-site
        'recaptcha': token                        // Or in request body
    },
    body: JSON.stringify({
        username: 'user@example.com',
        password: 'password'
    })
});
```

### 3. Alternative: Token in Request Body

```javascript
fetch('/auth/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Recaptcha-Sitekey': 'YOUR_SITE_KEY'
    },
    body: JSON.stringify({
        username: 'user@example.com',
        password: 'password',
        recaptcha: token  // Token in body
    })
});
```

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `secretKey` | `string` | Single site secret key (mutually exclusive with `sites`) |
| `sites` | `Array<{siteKey: string, secretKey: string, name?: string}>` | Multi-site configuration |
| `response` | `(req) => string` | Function to extract token from request |
| `skipIf` | `(req) => boolean` | Skip validation based on condition |
| `network` | `object` | HTTP client configuration (axios options) |
| `agent` | `Agent` | Custom HTTP agent |
| `actions` | `string[]` | Allowed reCAPTCHA actions |
| `score` | `number` | Minimum score threshold (0.0 - 1.0) |

## Migration from @nestlab/google-recaptcha

This package is a drop-in replacement:

```typescript
// Before
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';

// After
import { GoogleRecaptchaModule } from 'google-recaptcha-multisite';
```

All original features remain unchanged. Simply add multi-site configuration if needed.

## NestJS Version Compatibility

| Package Version | NestJS Version |
|----------------|---------------|
| 1.x.x | 7.0.0 - 11.x.x |

## API Reference

### Exports

- `GoogleRecaptchaModule` - Main module
- `GoogleRecaptchaGuard` - Route guard
- `GoogleRecaptchaFilter` - Exception filter
- `Recaptcha` - Decorator for validation
- `GOOGLE_RECAPTCHA_SECRET_MAP` - Global secret map for runtime secret loading
- `GoogleRecaptchaValidationResult` - Type alias for validation result

### Types

```typescript
interface GoogleRecaptchaModuleOptions {
    secretKey?: string;
    sites?: Array<{
        siteKey: string;
        secretKey: string;
        name?: string;
    }>;
    response: (req: any) => string;
    skipIf?: (req: any) => boolean;
    network?: AxiosRequestConfig;
    agent?: Agent;
    actions?: string[];
    score?: number;
}
```

## Troubleshooting

### Issue: "Invalid site key"

**Solution**: Ensure `X-Recaptcha-Sitekey` header matches one of your configured site keys.

### Issue: "Secret key not found"

**Solution**:
1. For static config, verify `sites` array contains the site key
2. For runtime loading, ensure `GOOGLE_RECAPTCHA_SECRET_MAP` is populated before app starts

### Issue: Works in @nestlab/google-recaptcha but not here

**Solution**: This is a backward-compatible fork. Please file an issue with reproduction steps.

## Contributing

Contributions welcome! Please check [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT

## Credits

- Original package: [@nestlab/google-recaptcha](https://github.com/chvarkov/google-recaptcha) by Alexey Chvarkov
- Fork maintainer: Anker DTC Team
