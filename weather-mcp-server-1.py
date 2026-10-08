from mcp.server.fastmcp import FastMCP

mcp = FastMCP("WeatherServer")


@mcp.tool()
def get_weather(city: str) -> str:
    """Get weather information"""
    return f"Weather in {city}: It is raining."


if __name__ == "__main__":
    mcp.run(transport="stdio")
    
    