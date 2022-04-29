FROM ros:foxy-ros-base
ARG  NODE_VERSION=v14.19.1

# Replace shell with bash so we can source files
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

ENV NVM_DIR /root/.nvm

# -------------------------------------------
# Step 1. ROS Installation
# Step 2. NVM Installation
# Step 3. ROS2 IoT Agent Installation
# -------------------------------------------

#   Step 1
RUN apt-get update && apt-get install -y \
      ros-${ROS_DISTRO}-demo-nodes-cpp \
      ros-${ROS_DISTRO}-demo-nodes-py \
      ros-${ROS_DISTRO}-turtlesim \
      curl && \
    rm -rf /var/lib/apt/lists/* &&\ 
        && source /root/.bashrc \
    && source /opt/ros/foxy/setup.bash \
#   Step 2
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh &&\
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash\
    && . $NVM_DIR/nvm.sh \
    && nvm list-remote \
    && nvm install "${NODE_VERSION}"\
    && node -v \
    && nvm list \
#   Step 3
    && curl -s -L https://github.com/FcoMelendez/iotagent-ros2/archive/refs/heads/master.zip > source.zip \
    && apt-get update && apt-get install -y --no-install-recommends unzip \
    && unzip source.zip \
    && rm source.zip \
    && cd iotagent-ros2-master && npm install \	


# launch ros package
CMD ["/root/.nvm/versions/node/v14.19.1/bin/node","iotagent-ros2-master/bin/iotagent-json"]

