/**
 * Metric type definitions for BTAR
 * Types for measuring code quality metrics via language tools
 */

import type { SupportedLanguage } from "../types.js";

/**
 * Types of metrics that can be measured
 */
export type MetricType = "type_strictness" | "lint_errors" | "test_coverage";

/**
 * Result of running a metric measurement tool
 */
export interface MetricResult {
  /** Type of metric measured */
  metric: MetricType;
  /** Tool that performed the measurement */
  tool: string;
  /** Measured value (error count or percentage) */
  value: number;
  /** Whether the tool executed successfully */
  success: boolean;
  diagnostic?: "consent-required" | "unsupported-python" | "runtime-unavailable" | "tool-failed" | "timeout" | "invalid-report";
  /** Raw tool output for debugging (optional) */
  raw?: string;
}

/**
 * Parser function signature for extracting metric value from tool output
 */
export type MetricParser = (stdout: string, stderr: string, exitCode: number) => number;

/**
 * Configuration for a tool that measures a specific metric
 */
export interface ToolMapping {
  /** Language this tool measures */
  language: SupportedLanguage;
  /** Metric type this tool measures */
  metric: MetricType;
  /** Tool name */
  tool: string;
  /** Command to execute (first element is executable, rest are args) */
  command: string[];
  /** Parser function to extract metric value from tool output */
  parser: MetricParser;
}
