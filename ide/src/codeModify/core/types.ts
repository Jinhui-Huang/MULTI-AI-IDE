/**
 * 多语言代码修改系统 - 核心类型定义
 */

/**
 * 支持的编程语言
 */
export type SupportedLanguage =
  | 'java'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'go'
  | 'rust'
  | 'cpp'
  | 'csharp'
  | 'kotlin'
  | 'swift';

/**
 * 代码修改意图 - 语言无关的高级描述
 */
export interface CodeModificationIntent {
  /** 修改操作类型 */
  action: CodeAction;

  /** 目标编程语言 */
  language: SupportedLanguage;

  /** 目标文件路径 */
  filePath: string;

  /** 操作详情（根据 action 类型变化） */
  details: Record<string, any>;

  /** 可选：修改的原因/描述 */
  reason?: string;
}

/**
 * 支持的代码修改操作
 */
export type CodeAction =
  | 'add_class'                    // 添加类/结构体
  | 'add_inner_class'              // 添加内部类
  | 'add_method'                   // 添加方法/函数
  | 'add_property'                 // 添加属性/字段
  | 'move_class'                   // 移动类到另一个文件
  | 'extract_class'                // 从现有代码提取类
  | 'modify_method'                // 修改方法实现
  | 'rename_class'                 // 重命名类
  | 'rename_method'                // 重命名方法
  | 'change_access_modifier'       // 改变访问修饰符
  | 'add_interface'                // 添加接口/trait
  | 'implement_interface'          // 实现接口
  | 'generic_code_insert';         // 通用代码插入

/**
 * 类定义参数
 */
export interface ClassDefinition {
  name: string;
  accessModifier?: 'public' | 'private' | 'protected' | 'internal';
  isAbstract?: boolean;
  isFinal?: boolean;
  extendsClass?: string;
  implementsInterfaces?: string[];
  properties?: PropertyDefinition[];
  methods?: MethodDefinition[];
  innerClasses?: ClassDefinition[];
  docComment?: string;
}

/**
 * 属性定义参数
 */
export interface PropertyDefinition {
  name: string;
  type: string;
  accessModifier?: 'public' | 'private' | 'protected' | 'internal';
  initialValue?: string;
  isStatic?: boolean;
  isFinal?: boolean;
  docComment?: string;
}

/**
 * 方法定义参数
 */
export interface MethodDefinition {
  name: string;
  returnType?: string;
  parameters?: ParameterDefinition[];
  accessModifier?: 'public' | 'private' | 'protected' | 'internal';
  isStatic?: boolean;
  isAbstract?: boolean;
  body?: string;
  docComment?: string;
}

/**
 * 参数定义
 */
export interface ParameterDefinition {
  name: string;
  type: string;
  defaultValue?: string;
}

/**
 * 修改结果
 */
export interface ModificationResult {
  success: boolean;
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  appliedActions: CodeAction[];
  error?: string;
  warnings?: string[];
}

/**
 * 语言配置
 */
export interface LanguageConfig {
  language: SupportedLanguage;
  fileExtensions: string[];
  /** 对应的格式化工具 */
  formatter: FormatterType;
  /** 是否使用 Tree-sitter */
  useTreeSitter: boolean;
  /** LSP 服务器名称 (如果支持) */
  lspServer?: string;
  /** 语言特定的适配器 */
  adapter: LanguageAdapter;
}

/**
 * 支持的格式化工具
 */
export type FormatterType =
  | 'prettier'         // JavaScript/TypeScript/JSON
  | 'black'           // Python
  | 'gofmt'           // Go
  | 'rustfmt'         // Rust
  | 'clang-format'    // C/C++
  | 'dotnet-format'   // C#
  | 'google-java-format' // Java
  | 'ktlint'          // Kotlin
  | 'swiftformat';     // Swift

/**
 * 语言适配器接口
 */
export interface LanguageAdapter {
  /** 解析代码文件 */
  parse(content: string): Promise<any>;

  /** 应用意图修改 */
  applyIntent(ast: any, intent: CodeModificationIntent): Promise<any>;

  /** 生成规范化代码 */
  generate(ast: any): Promise<string>;

  /** 验证代码合法性 */
  validate(content: string): Promise<ValidationResult>;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * LLM 生成的意图
 */
export interface LLMGeneratedIntent {
  language: SupportedLanguage;
  filePath: string;
  intents: CodeModificationIntent[];
  reasoning?: string;
}
