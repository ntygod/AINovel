# InkFlow 后端架构设计方案 (Java 版)

## 1. 技术栈选型

| 组件 | 技术选型 | 版本 | 说明 |
|------|----------|------|------|
| 框架 | Spring Boot | 3.2+ | 主框架 |
| 响应式 | Spring WebFlux | - | SSE 流式响应 |
| 安全 | Spring Security + JWT | - | 认证授权 |
| ORM | Spring Data JPA + QueryDSL | - | 数据访问 |
| 数据库 | PostgreSQL + pgvector | 16+ | 主库 + 向量检索 |
| 缓存 | Redis + Redisson | 7+ | 缓存 + 分布式锁 |
| API 文档 | SpringDoc OpenAPI | 2.3+ | Swagger UI |
| 构建 | Gradle (Kotlin DSL) | 8+ | 构建工具 |
| 容器化 | Docker + GraalVM | - | 可选 Native Image |

## 2. 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     前端 (React + Vite)                          │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTPS + JWT
┌──────────────────────────┼───────────────────────────────────────┐
│                    Spring Cloud Gateway                          │
│              (路由、限流、认证、CORS、日志)                        │
└──────────────────────────┼───────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                 Spring Boot Application                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Controller Layer                      │    │
│  │  AuthController | ProjectController | AIProxyController  │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│  ┌─────────────────────────┼───────────────────────────────┐    │
│  │                    Service Layer                         │    │
│  │  AuthService | ProjectService | ChapterService | AIService│   │
│  └─────────────────────────┬───────────────────────────────┘    │
│  ┌─────────────────────────┼───────────────────────────────┐    │
│  │                   Repository Layer                       │    │
│  │     JPA Repositories + Custom Query + Vector Search      │    │
│  └─────────────────────────┬───────────────────────────────┘    │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│  ┌──────────────┐  ┌───────┴─────┐  ┌──────────────┐            │
│  │ PostgreSQL   │  │   Redis     │  │  S3/MinIO    │            │
│  │ + pgvector   │  │             │  │              │            │
│  └──────────────┘  └─────────────┘  └──────────────┘            │
└───────────────────────────────────────────────────────────────────┘
```


## 3. 项目结构

```
inkflow-backend/
├── build.gradle.kts
├── settings.gradle.kts
├── src/
│   ├── main/
│   │   ├── java/com/inkflow/
│   │   │   ├── InkFlowApplication.java
│   │   │   ├── config/
│   │   │   │   ├── SecurityConfig.java
│   │   │   │   ├── WebFluxConfig.java
│   │   │   │   ├── RedisConfig.java
│   │   │   │   └── OpenApiConfig.java
│   │   │   ├── common/
│   │   │   │   ├── exception/
│   │   │   │   │   ├── GlobalExceptionHandler.java
│   │   │   │   │   ├── BusinessException.java
│   │   │   │   │   └── ErrorCode.java
│   │   │   │   ├── response/
│   │   │   │   │   └── ApiResponse.java
│   │   │   │   └── util/
│   │   │   │       ├── JwtUtil.java
│   │   │   │       └── CryptoUtil.java
│   │   │   ├── module/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── controller/AuthController.java
│   │   │   │   │   ├── service/AuthService.java
│   │   │   │   │   ├── dto/LoginRequest.java
│   │   │   │   │   └── dto/TokenResponse.java
│   │   │   │   ├── user/
│   │   │   │   │   ├── entity/User.java
│   │   │   │   │   ├── repository/UserRepository.java
│   │   │   │   │   └── service/UserService.java
│   │   │   │   ├── project/
│   │   │   │   │   ├── controller/ProjectController.java
│   │   │   │   │   ├── entity/Project.java
│   │   │   │   │   ├── repository/ProjectRepository.java
│   │   │   │   │   ├── service/ProjectService.java
│   │   │   │   │   └── dto/
│   │   │   │   ├── chapter/
│   │   │   │   │   ├── controller/ChapterController.java
│   │   │   │   │   ├── entity/Chapter.java
│   │   │   │   │   ├── repository/ChapterRepository.java
│   │   │   │   │   └── service/ChapterService.java
│   │   │   │   ├── plotloop/
│   │   │   │   │   ├── controller/PlotLoopController.java
│   │   │   │   │   ├── entity/PlotLoop.java
│   │   │   │   │   ├── repository/PlotLoopRepository.java
│   │   │   │   │   └── service/PlotLoopService.java
│   │   │   │   ├── character/
│   │   │   │   ├── volume/
│   │   │   │   ├── wiki/
│   │   │   │   └── ai/
│   │   │   │       ├── controller/AIProxyController.java
│   │   │   │       ├── service/AIService.java
│   │   │   │       ├── provider/
│   │   │   │       │   ├── AIProvider.java
│   │   │   │       │   ├── GeminiProvider.java
│   │   │   │       │   ├── OpenAIProvider.java
│   │   │   │       │   └── DeepSeekProvider.java
│   │   │   │       └── dto/
│   │   │   └── embedding/
│   │   │       ├── entity/Embedding.java
│   │   │       ├── repository/EmbeddingRepository.java
│   │   │       └── service/EmbeddingService.java
│   │   └── resources/
│   │       ├── application.yml
│   │       ├── application-dev.yml
│   │       ├── application-prod.yml
│   │       └── db/migration/  (Flyway)
│   └── test/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
└── docs/
```


## 4. 核心代码示例

### 4.1 build.gradle.kts

```kotlin
plugins {
    java
    id("org.springframework.boot") version "3.2.0"
    id("io.spring.dependency-management") version "1.1.4"
}

group = "com.inkflow"
version = "1.0.0"

java {
    sourceCompatibility = JavaVersion.VERSION_21
}

repositories {
    mavenCentral()
}

dependencies {
    // Spring Boot
    implementation("org.springframework.boot:spring-boot-starter-webflux")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-data-redis-reactive")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    
    // JWT
    implementation("io.jsonwebtoken:jjwt-api:0.12.3")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.12.3")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.12.3")
    
    // Database
    runtimeOnly("org.postgresql:postgresql")
    implementation("com.pgvector:pgvector:0.1.4")
    
    // OpenAPI
    implementation("org.springdoc:springdoc-openapi-starter-webflux-ui:2.3.0")
    
    // Utils
    implementation("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")
    implementation("org.mapstruct:mapstruct:1.5.5.Final")
    annotationProcessor("org.mapstruct:mapstruct-processor:1.5.5.Final")
    
    // AI SDK
    implementation("com.google.cloud:google-cloud-aiplatform:3.32.0")
    
    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("io.projectreactor:reactor-test")
}
```

### 4.2 实体类示例

```java
// User.java
@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @Column(unique = true, nullable = false)
    private String email;
    
    @Column(nullable = false)
    private String passwordHash;
    
    private String name;
    private String avatarUrl;
    
    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> settings = new HashMap<>();
    
    @CreationTimestamp
    private Instant createdAt;
    
    @UpdateTimestamp
    private Instant updatedAt;
}

// Project.java
@Entity
@Table(name = "projects")
@Data
@Builder
public class Project {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    
    @Column(nullable = false)
    private String title;
    
    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private NovelConfig config;
    
    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private WorldStructure structure;
    
    @OneToMany(mappedBy = "project", cascade = CascadeType.ALL)
    private List<Chapter> chapters = new ArrayList<>();
    
    @OneToMany(mappedBy = "project", cascade = CascadeType.ALL)
    private List<PlotLoop> plotLoops = new ArrayList<>();
    
    @CreationTimestamp
    private Instant createdAt;
    
    @UpdateTimestamp
    private Instant updatedAt;
}

// PlotLoop.java
@Entity
@Table(name = "plot_loops")
@Data
@Builder
public class PlotLoop {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;
    
    @Column(nullable = false)
    private String title;
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PlotLoopStatus status = PlotLoopStatus.OPEN;
    
    @Column(nullable = false)
    private Integer importance = 3;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "setup_chapter_id")
    private Chapter setupChapter;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_chapter_id")
    private Chapter targetChapter;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "close_chapter_id")
    private Chapter closeChapter;
    
    private String abandonReason;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_loop_id")
    private PlotLoop parentLoop;
    
    @Column(columnDefinition = "uuid[]")
    private UUID[] relatedCharacterIds;
    
    private Boolean aiSuggested = false;
    
    @CreationTimestamp
    private Instant createdAt;
    
    @UpdateTimestamp
    private Instant updatedAt;
}

public enum PlotLoopStatus {
    OPEN, URGENT, CLOSED, ABANDONED
}
```


### 4.3 AI 流式响应 (SSE)

```java
// AIProxyController.java
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AIProxyController {
    
    private final AIService aiService;
    
    /**
     * 流式生成章节内容 - SSE
     */
    @PostMapping(value = "/generate-content", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> generateContent(
            @RequestBody GenerateContentRequest request,
            @AuthenticationPrincipal UserPrincipal user) {
        
        return aiService.streamGenerateContent(user.getId(), request)
            .map(chunk -> ServerSentEvent.<String>builder()
                .data(chunk)
                .build())
            .concatWith(Flux.just(ServerSentEvent.<String>builder()
                .data("[DONE]")
                .build()))
            .onErrorResume(e -> Flux.just(ServerSentEvent.<String>builder()
                .data("{\"error\":\"" + e.getMessage() + "\"}")
                .build()));
    }
    
    /**
     * 生成细纲
     */
    @PostMapping("/generate-beats")
    public Mono<ApiResponse<List<String>>> generateBeats(
            @RequestBody GenerateBeatsRequest request,
            @AuthenticationPrincipal UserPrincipal user) {
        
        return aiService.generateBeats(user.getId(), request)
            .map(ApiResponse::success);
    }
}

// AIService.java
@Service
@RequiredArgsConstructor
@Slf4j
public class AIService {
    
    private final ApiKeyService apiKeyService;
    private final ProjectService projectService;
    private final Map<String, AIProvider> providers;
    
    public Flux<String> streamGenerateContent(UUID userId, GenerateContentRequest request) {
        // 1. 获取解密后的 API Key
        String apiKey = apiKeyService.getDecryptedKey(userId, request.getProvider());
        if (apiKey == null) {
            return Flux.error(new BusinessException(ErrorCode.API_KEY_NOT_CONFIGURED));
        }
        
        // 2. 构建上下文
        String context = buildContext(request.getProjectId(), request.getChapterId());
        
        // 3. 获取对应的 AI Provider
        AIProvider provider = providers.get(request.getProvider());
        
        // 4. 流式调用
        return provider.streamGenerate(apiKey, request.getPrompt(), context);
    }
    
    private String buildContext(UUID projectId, UUID chapterId) {
        // 构建包含角色、伏笔、前文等的上下文
        Project project = projectService.getById(projectId);
        // ... 构建逻辑
        return contextBuilder.build();
    }
}

// GeminiProvider.java
@Component("google")
@Slf4j
public class GeminiProvider implements AIProvider {
    
    private final WebClient webClient;
    
    public GeminiProvider() {
        this.webClient = WebClient.builder()
            .baseUrl("https://generativelanguage.googleapis.com/v1beta")
            .build();
    }
    
    @Override
    public Flux<String> streamGenerate(String apiKey, String prompt, String context) {
        String fullPrompt = context + "\n\n" + prompt;
        
        Map<String, Object> requestBody = Map.of(
            "contents", List.of(Map.of(
                "parts", List.of(Map.of("text", fullPrompt))
            )),
            "generationConfig", Map.of(
                "temperature", 0.8,
                "maxOutputTokens", 8192
            )
        );
        
        return webClient.post()
            .uri("/models/gemini-1.5-flash:streamGenerateContent?key={key}&alt=sse", apiKey)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(requestBody)
            .retrieve()
            .bodyToFlux(String.class)
            .filter(line -> line.startsWith("data: "))
            .map(line -> line.substring(6))
            .filter(json -> !json.equals("[DONE]"))
            .map(this::extractText)
            .onErrorMap(e -> new BusinessException(ErrorCode.AI_API_ERROR, e.getMessage()));
    }
    
    private String extractText(String json) {
        try {
            JsonNode node = objectMapper.readTree(json);
            return node.path("candidates").path(0)
                      .path("content").path("parts").path(0)
                      .path("text").asText("");
        } catch (Exception e) {
            return "";
        }
    }
}
```


### 4.4 安全配置

```java
// SecurityConfig.java
@Configuration
@EnableWebFluxSecurity
@RequiredArgsConstructor
public class SecurityConfig {
    
    private final JwtAuthenticationFilter jwtFilter;
    
    @Bean
    public SecurityWebFilterChain securityFilterChain(ServerHttpSecurity http) {
        return http
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .authorizeExchange(auth -> auth
                .pathMatchers("/api/auth/login", "/api/auth/register").permitAll()
                .pathMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                .pathMatchers("/actuator/health").permitAll()
                .anyExchange().authenticated()
            )
            .addFilterAt(jwtFilter, SecurityWebFiltersOrder.AUTHENTICATION)
            .build();
    }
    
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:3000", "https://inkflow.app"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
    
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}

// JwtUtil.java
@Component
public class JwtUtil {
    
    @Value("${jwt.secret}")
    private String secret;
    
    @Value("${jwt.expiration}")
    private long expiration; // 15 minutes
    
    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }
    
    public String generateToken(User user) {
        return Jwts.builder()
            .subject(user.getId().toString())
            .claim("email", user.getEmail())
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + expiration))
            .signWith(getSigningKey())
            .compact();
    }
    
    public Claims parseToken(String token) {
        return Jwts.parser()
            .verifyWith(getSigningKey())
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}

// CryptoUtil.java - API Key 加密
@Component
public class CryptoUtil {
    
    @Value("${encryption.key}")
    private String encryptionKey; // 32 bytes hex
    
    private static final String ALGORITHM = "AES/CBC/PKCS5Padding";
    
    public String encrypt(String plainText) {
        try {
            byte[] iv = new byte[16];
            new SecureRandom().nextBytes(iv);
            
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, 
                new SecretKeySpec(hexToBytes(encryptionKey), "AES"),
                new IvParameterSpec(iv));
            
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(iv) + ":" + bytesToHex(encrypted);
        } catch (Exception e) {
            throw new RuntimeException("Encryption failed", e);
        }
    }
    
    public String decrypt(String encryptedText) {
        try {
            String[] parts = encryptedText.split(":");
            byte[] iv = hexToBytes(parts[0]);
            byte[] encrypted = hexToBytes(parts[1]);
            
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE,
                new SecretKeySpec(hexToBytes(encryptionKey), "AES"),
                new IvParameterSpec(iv));
            
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Decryption failed", e);
        }
    }
}
```

### 4.5 限流配置

```java
// RateLimitConfig.java
@Configuration
public class RateLimitConfig {
    
    @Bean
    public RedisRateLimiter aiGenerateRateLimiter() {
        // 每分钟 10 次
        return new RedisRateLimiter(10, 10);
    }
    
    @Bean
    public RedisRateLimiter defaultRateLimiter() {
        // 每分钟 100 次
        return new RedisRateLimiter(100, 100);
    }
}

// 使用 Bucket4j + Redis 实现分布式限流
@Aspect
@Component
@RequiredArgsConstructor
public class RateLimitAspect {
    
    private final RedissonClient redisson;
    
    @Around("@annotation(rateLimit)")
    public Object rateLimit(ProceedingJoinPoint pjp, RateLimit rateLimit) throws Throwable {
        String key = "rate_limit:" + getUserId() + ":" + rateLimit.key();
        
        RRateLimiter limiter = redisson.getRateLimiter(key);
        limiter.trySetRate(RateType.OVERALL, rateLimit.permits(), rateLimit.duration(), RateIntervalUnit.SECONDS);
        
        if (!limiter.tryAcquire()) {
            throw new BusinessException(ErrorCode.RATE_LIMIT_EXCEEDED);
        }
        
        return pjp.proceed();
    }
}
```


## 5. 数据库设计

### 5.1 Flyway 迁移脚本

```sql
-- V1__init_schema.sql

-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    avatar_url TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 项目表
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    structure JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);

-- 分卷表
CREATE TABLE volumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    core_conflict TEXT,
    "order" INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, "order")
);

-- 章节表
CREATE TABLE chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    volume_id UUID REFERENCES volumes(id) ON DELETE SET NULL,
    "order" INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    content TEXT,
    word_count INTEGER DEFAULT 0,
    beats JSONB DEFAULT '[]',
    tension INTEGER CHECK (tension >= 1 AND tension <= 10),
    parent_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, "order")
);

CREATE INDEX idx_chapters_project_id ON chapters(project_id);
CREATE INDEX idx_chapters_volume_id ON chapters(volume_id);

-- 角色表
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(100),
    description TEXT,
    appearance TEXT,
    background TEXT,
    personality TEXT,
    relationships JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_characters_project_id ON characters(project_id);

-- 伏笔表
CREATE TABLE plot_loops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' 
        CHECK (status IN ('OPEN', 'URGENT', 'CLOSED', 'ABANDONED')),
    importance INTEGER NOT NULL DEFAULT 3 CHECK (importance >= 1 AND importance <= 5),
    setup_chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
    target_chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
    target_volume_id UUID REFERENCES volumes(id) ON DELETE SET NULL,
    close_chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
    abandon_reason TEXT,
    parent_loop_id UUID REFERENCES plot_loops(id) ON DELETE SET NULL,
    related_character_ids UUID[] DEFAULT '{}',
    related_wiki_entry_ids UUID[] DEFAULT '{}',
    ai_suggested BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plot_loops_project_id ON plot_loops(project_id);
CREATE INDEX idx_plot_loops_status ON plot_loops(status);

-- Wiki 词条表
CREATE TABLE wiki_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    first_appearance_chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Key 表 (加密存储)
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    encrypted_key TEXT NOT NULL,
    key_hint VARCHAR(10),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- 向量嵌入表 (RAG)
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('chapter', 'character', 'wiki')),
    source_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embeddings_project_id ON embeddings(project_id);
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```


## 6. API 接口设计

### 6.1 认证接口

```yaml
POST /api/auth/register:
  requestBody:
    email: string
    password: string
    name: string
  response:
    accessToken: string
    refreshToken: string (HttpOnly Cookie)

POST /api/auth/login:
  requestBody:
    email: string
    password: string
  response:
    accessToken: string
    user: { id, email, name, avatarUrl }

POST /api/auth/refresh:
  cookies: refreshToken
  response:
    accessToken: string

GET /api/auth/me:
  headers: Authorization: Bearer {token}
  response:
    user: { id, email, name, avatarUrl, settings }
```

### 6.2 项目接口

```yaml
GET /api/projects:
  response:
    projects: [{ id, title, genre, wordCount, lastModified }]

POST /api/projects:
  requestBody:
    title: string
    config: NovelConfig
  response:
    project: Project

GET /api/projects/{id}:
  response:
    project: Project (含 chapters, characters, plotLoops 等)

PUT /api/projects/{id}:
  requestBody:
    title?: string
    config?: NovelConfig
    structure?: WorldStructure
  response:
    project: Project

DELETE /api/projects/{id}:
  response: 204 No Content
```

### 6.3 章节接口

```yaml
GET /api/projects/{projectId}/chapters:
  query:
    includeContent: boolean (default: false)
  response:
    chapters: [Chapter]

POST /api/projects/{projectId}/chapters:
  requestBody:
    title: string
    summary: string
    volumeId?: string
  response:
    chapter: Chapter

GET /api/projects/{projectId}/chapters/{id}:
  response:
    chapter: Chapter (含 content)

PUT /api/projects/{projectId}/chapters/{id}:
  requestBody:
    title?: string
    summary?: string
    content?: string
    beats?: string[]
  response:
    chapter: Chapter

PUT /api/projects/{projectId}/chapters/reorder:
  requestBody:
    orders: [{ id: string, order: number }]
  response: 200 OK
```

### 6.4 伏笔接口

```yaml
GET /api/projects/{projectId}/plot-loops:
  query:
    status?: OPEN | URGENT | CLOSED | ABANDONED
    importance?: 1-5
    chapterId?: string
  response:
    plotLoops: [PlotLoop]

POST /api/projects/{projectId}/plot-loops:
  requestBody:
    title: string
    description: string
    setupChapterId: string
    importance: number
    targetChapterId?: string
    targetVolumeId?: string
  response:
    plotLoop: PlotLoop

PUT /api/projects/{projectId}/plot-loops/{id}:
  requestBody: Partial<PlotLoop>
  response:
    plotLoop: PlotLoop

POST /api/projects/{projectId}/plot-loops/{id}/close:
  requestBody:
    closeChapterId: string
  response:
    plotLoop: PlotLoop

POST /api/projects/{projectId}/plot-loops/{id}/abandon:
  requestBody:
    reason: string
  response:
    plotLoop: PlotLoop
```

### 6.5 AI 代理接口

```yaml
POST /api/ai/generate-beats:
  requestBody:
    projectId: string
    chapterId: string
    prompt?: string
  response:
    beats: string[]

POST /api/ai/generate-content:
  produces: text/event-stream
  requestBody:
    projectId: string
    chapterId: string
    prompt: string
    provider: google | openai | deepseek
  response: SSE stream
    data: { text: string }
    data: [DONE]

POST /api/ai/polish:
  produces: text/event-stream
  requestBody:
    text: string
    action: polish | vivid | expand | concise
    context: { before: string, after: string }
  response: SSE stream

POST /api/ai/embed:
  requestBody:
    projectId: string
    sourceType: chapter | character | wiki
    sourceId: string
    content: string
  response: 200 OK

POST /api/ai/search:
  requestBody:
    projectId: string
    query: string
    limit?: number
  response:
    results: [{ sourceType, sourceId, content, similarity }]
```


## 7. 部署配置

### 7.1 application.yml

```yaml
spring:
  application:
    name: inkflow-backend
  
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:inkflow}
    username: ${DB_USER:inkflow}
    password: ${DB_PASSWORD:password}
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
  
  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        format_sql: true
  
  flyway:
    enabled: true
    locations: classpath:db/migration
  
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:}

jwt:
  secret: ${JWT_SECRET:your-256-bit-secret-key-here-min-32-chars}
  expiration: 900000  # 15 minutes
  refresh-expiration: 604800000  # 7 days

encryption:
  key: ${ENCRYPTION_KEY:your-32-byte-hex-encryption-key}

server:
  port: 8080

springdoc:
  api-docs:
    path: /v3/api-docs
  swagger-ui:
    path: /swagger-ui.html

logging:
  level:
    com.inkflow: DEBUG
    org.springframework.security: DEBUG
```

### 7.2 Dockerfile

```dockerfile
# 多阶段构建
FROM gradle:8-jdk21 AS builder
WORKDIR /app
COPY build.gradle.kts settings.gradle.kts ./
COPY src ./src
RUN gradle build -x test --no-daemon

# 运行镜像
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# 安全：非 root 用户
RUN addgroup -S inkflow && adduser -S inkflow -G inkflow
USER inkflow

COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "-Xmx512m", "-Xms256m", "app.jar"]
```

### 7.3 docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=inkflow
      - DB_USER=inkflow
      - DB_PASSWORD=${DB_PASSWORD}
      - REDIS_HOST=redis
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: pgvector/pgvector:pg16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=inkflow
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=inkflow
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U inkflow"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes

volumes:
  postgres_data:
  redis_data:
```

### 7.4 GraalVM Native Image (可选，减少内存)

```kotlin
// build.gradle.kts 添加
plugins {
    id("org.graalvm.buildtools.native") version "0.9.28"
}

graalvmNative {
    binaries {
        named("main") {
            imageName.set("inkflow")
            mainClass.set("com.inkflow.InkFlowApplication")
            buildArgs.add("--enable-preview")
        }
    }
}
```

构建命令：
```bash
./gradlew nativeCompile
```

Native Image 优势：
- 启动时间：~50ms (vs JVM ~3s)
- 内存占用：~50MB (vs JVM ~200MB)
- 适合 Serverless 部署


## 8. 前端适配改动

### 8.1 新增 API Client

```typescript
// services/apiClient.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

class ApiClient {
    private accessToken: string | null = null;
    
    setToken(token: string) {
        this.accessToken = token;
    }
    
    clearToken() {
        this.accessToken = null;
    }
    
    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        
        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
            credentials: 'include', // for refresh token cookie
        });
        
        if (response.status === 401) {
            // Try refresh token
            const refreshed = await this.refreshToken();
            if (refreshed) {
                return this.request(endpoint, options);
            }
            throw new Error('Unauthorized');
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Request failed');
        }
        
        return response.json();
    }
    
    // SSE 流式请求
    async *streamRequest(
        endpoint: string,
        body: object
    ): AsyncGenerator<string> {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`,
            },
            body: JSON.stringify(body),
        });
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    yield data;
                }
            }
        }
    }
    
    // Auth
    async login(email: string, password: string) {
        const data = await this.request<{ accessToken: string; user: User }>(
            '/auth/login',
            { method: 'POST', body: JSON.stringify({ email, password }) }
        );
        this.setToken(data.accessToken);
        return data;
    }
    
    // Projects
    getProjects = () => this.request<{ projects: ProjectMetadata[] }>('/projects');
    getProject = (id: string) => this.request<{ project: NovelState }>(`/projects/${id}`);
    createProject = (data: Partial<NovelState>) => 
        this.request<{ project: NovelState }>('/projects', { method: 'POST', body: JSON.stringify(data) });
    updateProject = (id: string, data: Partial<NovelState>) =>
        this.request<{ project: NovelState }>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    
    // AI
    generateBeats = (projectId: string, chapterId: string) =>
        this.request<{ beats: string[] }>('/ai/generate-beats', {
            method: 'POST',
            body: JSON.stringify({ projectId, chapterId })
        });
    
    streamGenerateContent = (projectId: string, chapterId: string, prompt: string) =>
        this.streamRequest('/ai/generate-content', { projectId, chapterId, prompt, provider: 'google' });
}

export const apiClient = new ApiClient();
```

### 8.2 修改 geminiService.ts

```typescript
// services/geminiService.ts - 改为调用后端 API

export async function* streamChapterContent(
    chapter: Chapter,
    allChapters: Chapter[],
    config: NovelConfig,
    characters: Character[],
    settings: AppSettings,
    structure: WorldStructure,
    volumes: Volume[]
): AsyncGenerator<{ text: string }> {
    // 不再直接调用 Gemini API，改为调用后端
    const prompt = buildPrompt(chapter, config, characters, structure);
    
    for await (const chunk of apiClient.streamGenerateContent(
        chapter.projectId,
        chapter.id,
        prompt
    )) {
        try {
            const data = JSON.parse(chunk);
            if (data.text) {
                yield { text: data.text };
            }
        } catch {
            // ignore parse errors
        }
    }
}
```

## 9. 迁移计划

### Phase 1: 基础框架 (1周)
- [ ] 搭建 Spring Boot 项目骨架
- [ ] 配置 PostgreSQL + Flyway
- [ ] 实现用户认证 (JWT)
- [ ] 部署测试环境

### Phase 2: AI 代理 (1周)
- [ ] 实现 AI Provider 抽象层
- [ ] 实现 Gemini/OpenAI/DeepSeek 适配器
- [ ] SSE 流式响应
- [ ] API Key 加密存储
- [ ] 前端适配

### Phase 3: 数据迁移 (2周)
- [ ] 实现项目 CRUD API
- [ ] 实现章节 CRUD API
- [ ] 实现伏笔 CRUD API
- [ ] 实现角色/Wiki API
- [ ] 前端改用后端 API
- [ ] IndexedDB 作为离线缓存

### Phase 4: 高级功能 (持续)
- [ ] RAG 向量检索
- [ ] 导入/导出
- [ ] 数据同步
- [ ] 性能优化

## 10. 成本估算

| 服务 | 规格 | 月成本 |
|------|------|--------|
| 云服务器 | 2C4G | ¥100-200 |
| PostgreSQL | 托管基础版 | ¥100-300 |
| Redis | 托管基础版 | ¥50-100 |
| 对象存储 | 按量 | ¥10-50 |
| **总计** | | **¥260-650** |

*使用 GraalVM Native Image 可降低服务器配置需求*
