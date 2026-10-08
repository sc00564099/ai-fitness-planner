import asyncio

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langchain_mcp_adapters.client import MultiServerMCPClient


async def main():

    client = MultiServerMCPClient(
        {
            "math": {
                "command": "python",
                "args": ["mathserver.py"],
                "transport": "stdio",
            },
            "weather": {
                "command": "python",
                "args": ["weather.py"],
                "transport": "stdio",
            },
        }
    )

    tools = await client.get_tools()

    llm = ChatOpenAI(model="gpt-4o")

    agent = create_react_agent(llm, tools)

    while True:
        user_input = input("\nAsk something: ")

        if user_input.lower() == "exit":
            break

        result = await agent.ainvoke(
            {
                "messages": [
                    {"role": "user", "content": user_input}
                ]
            }
        )

        print("\nResult:")
        print(result["messages"][-1].content)


if __name__ == "__main__":
    asyncio.run(main())