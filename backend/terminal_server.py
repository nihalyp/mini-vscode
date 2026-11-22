import asyncio
import os
import pty
import websockets


async def terminal_handler(websocket):
    master_fd, slave_fd = pty.openpty()

    shell = os.environ.get("SHELL")
    if not shell or not os.path.exists(shell):
        termux_bash = "/data/data/com.termux/files/usr/bin/bash"
        shell = termux_bash if os.path.exists(termux_bash) else "/bin/sh"

    env = os.environ.copy()
    env.setdefault("TERM", "xterm-256color")

    process = await asyncio.create_subprocess_exec(
        shell,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        start_new_session=True,
        env=env,
    )
    os.close(slave_fd)
    os.set_blocking(master_fd, False)

    loop = asyncio.get_running_loop()
    pty_queue = asyncio.Queue()

    def on_pty_readable():
        try:
            data = os.read(master_fd, 4096)
            if data:
                loop.call_soon_threadsafe(pty_queue.put_nowait, data)
        except OSError:
            pass

    loop.add_reader(master_fd, on_pty_readable)

    async def send_to_browser():
        try:
            while True:
                data = await pty_queue.get()
                await websocket.send(data.decode("utf-8", errors="replace"))
        except (websockets.ConnectionClosed, asyncio.CancelledError):
            pass

    async def receive_from_browser():
        try:
            async for message in websocket:
                if isinstance(message, str):
                    os.write(master_fd, message.encode("utf-8"))
                elif isinstance(message, bytes):
                    os.write(master_fd, message)
        except (websockets.ConnectionClosed, asyncio.CancelledError):
            pass

    sender_task = asyncio.create_task(send_to_browser())
    receiver_task = asyncio.create_task(receive_from_browser())

    try:
        await asyncio.wait(
            [sender_task, receiver_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
    finally:
        sender_task.cancel()
        receiver_task.cancel()
        loop.remove_reader(master_fd)
        try:
            os.close(master_fd)
        except OSError:
            pass
        if process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass


async def main():
    async with websockets.serve(terminal_handler, "localhost", 8765):
        print("Interactive Terminal WebSocket running on ws://localhost:8765")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())

