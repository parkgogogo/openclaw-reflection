### Improve Tool Functionality Integration in LLMService

The current implementation of the LLMService class in the file [src/llm/service.ts](https://github.com/parkgogogo/openclaw-reflection/blob/main/src/llm/service.ts) relies on prompt construction (buildAgentLoopPrompt) to integrate tools into the chat loop. While this design supports flexibility, modern OpenAI-like APIs typically provide function_call (tool-specific) interfaces that could streamline tool integration and reduce the reliance on string-parsing and validation logic.

**Problem:**
- Reliance on prompt construction for tool invocation.
- Lack of direct usage of OpenAI function_call (or similar) for tools.
- Increased complexity in parsing and validation of user actions via normalizeAgentAction.

**Suggestion:**
- Refactor the LLMService to leverage native function_call API endpoints (if supported by the underlying provider).
- Simplify tool integration by directly describing the tool schema in the function_call interface.
- Reduce dependencies on the custom prompt-building logic (e.g., buildAgentLoopPrompt).

**Expected Benefits:**
- More efficient and clear tool-to-model communication.
- Reduced error-prone manual parsing of agent actions.

Please let me know if additional clarification is needed or if you would like a proof-of-concept PR.