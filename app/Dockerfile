FROM python:3.11-slim

WORKDIR /srv

RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ -r /tmp/requirements.lock

COPY common/ /srv/common/
COPY public.py admin.py entrypoint.py mcp_server.py /srv/
COPY .chainlit/ /srv/.chainlit/
COPY fonts/ /srv/fonts/

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/srv \
    SIDE=public \
    PORT=8000

EXPOSE 8000

CMD ["python", "entrypoint.py"]
