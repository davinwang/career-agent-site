FROM python:3.11-slim

WORKDIR /srv

COPY requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ -r /tmp/requirements.lock

COPY common/ /srv/common/
COPY public.py admin.py entrypoint.py /srv/
COPY .chainlit/ /srv/.chainlit/

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/srv \
    SIDE=public \
    PORT=8000

EXPOSE 8000

CMD ["python", "entrypoint.py"]
