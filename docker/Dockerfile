FROM ros:foxy-ros-base
ARG  NODE_VERSION=v14.19.1

# Replace shell with bash so we can source files
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

ENV NVM_DIR /root/.nvm

# -------------------------------------------
# Step 1. Install a custom ros package (Test)
# Step 2. Install NVM
# Step 3. Install the ROS2 IoT Agent
# Step 4. Run the Agent
# -------------------------------------------
#   Step 1
RUN apt-get update && apt-get install -y \
      ros-${ROS_DISTRO}-demo-nodes-cpp \
      ros-${ROS_DISTRO}-demo-nodes-py \
      ros-${ROS_DISTRO}-turtlesim \
      curl && \
    rm -rf /var/lib/apt/lists/* &&\ 
#   Step 2
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh &&\
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash\
    && source /root/.bashrc \
    && source /opt/ros/foxy/setup.bash \
    && . $NVM_DIR/nvm.sh \
    && nvm list-remote \
    && nvm install "${NODE_VERSION}"\
    && node -v \
    && nvm list \
#   Step 3
    && curl -s -L https://github.com/FcoMelendez/iotagent-json/archive/refs/heads/binding-ros2.zip > source.zip \
    && apt-get update && apt-get install -y --no-install-recommends unzip \
    && unzip source.zip \
    && rm source.zip \
    && cd iotagent-json-binding-ros2 && npm install \
#   Step 4
    && ros2 interface list \
    && which node && pwd	


# launch ros package
CMD ["/root/.nvm/versions/node/v14.19.1/bin/node", "/iotagent-json-binding-ros2/bin/iotagent-json"]

